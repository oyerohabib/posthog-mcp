/**
 * HTTP application: health, OAuth PRM, onboarding, authenticated Streamable HTTP /mcp.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createPostHogMcpServer } from "../server.js";
import type { PostHogClient } from "../posthog/types.js";
import { MockPostHogClient } from "../posthog/mock.js";
import {
  createDefaultAuthenticator,
  oauthWwwAuthenticate,
  type Authenticator,
  type Principal,
  redactHeaders,
} from "./auth.js";
import {
  createLiveClientFromHeaders,
  parsePostHogHeaders,
} from "./posthog-headers.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";
import type { ConnectionStore } from "./db/types.js";
import { createMemoryStore } from "./db/memory.js";
import { createOnboardingHandler, ensureUserQueryLink } from "./onboarding.js";
import { createOnboardingRequiredClient } from "./onboarding-client.js";
import {
  protectedResourceMetadata,
  publicBaseUrl,
  resourceMetadataPath,
  resourceMetadataUrl,
} from "./oauth/prm.js";
import { resolveUserPostHogClient } from "./resolve-client.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/health";
const REQUEST_TIMEOUT_MS = 60_000;

export type AppOptions = {
  authenticator?: Authenticator;
  rateLimiter?: FixedWindowRateLimiter;
  store?: ConnectionStore;
  /**
   * Test-only: after auth, use mock PostHog instead of live credentials.
   * Never enabled in production.
   */
  useMockPostHog?: boolean;
  /** Allow X-PostHog-* headers for api_key principals / legacy */
  allowHeaderCredentials?: boolean;
  allowedOrigins?: Set<string>;
  onLog?: (msg: string, meta?: Record<string, unknown>) => void;
};

export type CreateAppResult = {
  fetch: (request: Request) => Promise<Response>;
  authenticator: Authenticator;
  rateLimiter: FixedWindowRateLimiter;
  store: ConnectionStore;
};

function json(
  status: number,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function parseAllowedOrigins(
  env: string | undefined = process.env.MCP_ALLOWED_ORIGINS,
): Set<string> {
  const set = new Set<string>();
  if (!env) return set;
  for (const part of env.split(",")) {
    const o = part.trim();
    if (o) set.add(o);
  }
  return set;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "unknown";
}

function validateOrigin(
  request: Request,
  allowed: Set<string>,
): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (allowed.size === 0) {
    return json(403, { error: "Origin not allowed" });
  }
  if (!allowed.has(origin)) {
    return json(403, { error: "Origin not allowed" });
  }
  return null;
}

export function createHttpApp(options: AppOptions = {}): CreateAppResult {
  const authenticator =
    options.authenticator ?? createDefaultAuthenticator();
  const rateLimiter =
    options.rateLimiter ??
    new FixedWindowRateLimiter({ max: 120, windowMs: 60_000 });
  const store = options.store ?? createMemoryStore();
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins();
  const useMockPostHog = Boolean(options.useMockPostHog);
  const allowHeaderCredentials =
    options.allowHeaderCredentials ??
    process.env.ALLOW_POSTHOG_HEADER_CREDENTIALS === "1";
  const onboarding = createOnboardingHandler(store);
  const log =
    options.onLog ??
    ((msg: string, meta?: Record<string, unknown>) => {
      if (meta) console.error(`[http] ${msg}`, meta);
      else console.error(`[http] ${msg}`);
    });

  async function resolveClient(
    request: Request,
    principal: Principal,
  ): Promise<
    { ok: true; client: PostHogClient } | { ok: false; response: Response }
  > {
    if (useMockPostHog) {
      if (process.env.NODE_ENV === "production") {
        return {
          ok: false,
          response: json(500, {
            error: "Mock PostHog is not allowed in production",
          }),
        };
      }
      return { ok: true, client: new MockPostHogClient() };
    }

    if (principal.type === "oauth") {
      const user = await store.upsertUser(
        principal.workosUserId ?? principal.id,
        principal.email,
      );
      const link = ensureUserQueryLink(user.id);
      const resolved = await resolveUserPostHogClient({
        principal: {
          ...principal,
          workosUserId: principal.workosUserId ?? principal.id,
        },
        store,
      });
      // Keep MCP connected (initialize / tools/list) even before PostHog OAuth;
      // tool calls return the onboarding URL instead of failing the HTTP session.
      if (!resolved.ok) {
        log("posthog onboarding required", { userId: user.id, link });
        return { ok: true, client: createOnboardingRequiredClient(link) };
      }
      return { ok: true, client: resolved.client };
    }

    // api_key principal: header credentials (legacy / ops); always accepted outside
    // production, or in production when ALLOW_POSTHOG_HEADER_CREDENTIALS=1
    if (allowHeaderCredentials || process.env.NODE_ENV !== "production") {
      const parsed = parsePostHogHeaders(request.headers);
      if (parsed.ok) {
        return { ok: true, client: createLiveClientFromHeaders(parsed.config) };
      }
      return {
        ok: false,
        response: json(parsed.status, { error: parsed.message }),
      };
    }

    return {
      ok: false,
      response: json(403, {
        error:
          "PostHog credentials required. Complete OAuth onboarding or set ALLOW_POSTHOG_HEADER_CREDENTIALS=1 for header-based ops access.",
        onboardingUrl: `${publicBaseUrl()}/onboarding`,
      }),
    };
  }

  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === HEALTH_PATH && request.method === "GET") {
      return json(200, { ok: true });
    }

    // RFC 9728 Protected Resource Metadata
    if (
      (path === "/.well-known/oauth-protected-resource" ||
        path === resourceMetadataPath()) &&
      request.method === "GET"
    ) {
      return json(200, protectedResourceMetadata() as Record<string, unknown>);
    }

    const onboarded = await onboarding(request);
    if (onboarded) return onboarded;

    if (path !== MCP_PATH) {
      return json(404, { error: "Not found" });
    }

    const originError = validateOrigin(request, allowedOrigins);
    if (originError) return originError;

    const auth = await authenticator.authenticate(
      request.headers.get("authorization"),
    );
    if (!auth.ok) {
      const headers: Record<string, string> = {};
      if (auth.oauthChallenge) {
        headers["WWW-Authenticate"] = oauthWwwAuthenticate(
          resourceMetadataUrl(),
        );
      }
      return json(auth.status, { error: auth.message }, headers);
    }

    const principal: Principal = auth.principal;
    // Upsert OAuth users early so onboarding links work
    if (principal.type === "oauth") {
      await store.upsertUser(
        principal.workosUserId ?? principal.id,
        principal.email,
      );
    }

    const rl = rateLimiter.check(`${clientIp(request)}:${principal.id}`);
    if (!rl.ok) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfterSec),
        },
      });
    }

    const ph = await resolveClient(request, principal);
    if (!ph.ok) return ph.response;

    log("mcp request", {
      method: request.method,
      path,
      principal: principal.id,
      principalType: principal.type,
      headers: redactHeaders(Object.fromEntries(request.headers.entries())),
    });

    const client = ph.client;
    const mcpHandler = createMcpHandler(() => createPostHogMcpServer(client), {
      legacy: "stateless",
      maxRequestBodySize: 1_000_000,
    });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        mcpHandler.fetch(request),
        new Promise<Response>((_, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(Object.assign(new Error("timeout"), { timeout: true })),
            REQUEST_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      if (err && typeof err === "object" && "timeout" in err) {
        return json(504, { error: "Request timeout" });
      }
      log("mcp handler error", {
        message: err instanceof Error ? err.message : String(err),
      });
      return json(500, { error: "Internal server error" });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  return { fetch, authenticator, rateLimiter, store };
}
