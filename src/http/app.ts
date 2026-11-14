/**
 * HTTP application: /health + authenticated Streamable HTTP /mcp.
 */
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createPostHogMcpServer } from "../server.js";
import type { PostHogClient } from "../posthog/types.js";
import { MockPostHogClient } from "../posthog/mock.js";
import {
  BearerApiKeyAuthenticator,
  type Authenticator,
  type Principal,
  redactHeaders,
} from "./auth.js";
import {
  createLiveClientFromHeaders,
  parsePostHogHeaders,
} from "./posthog-headers.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/health";
const REQUEST_TIMEOUT_MS = 60_000;

export type AppOptions = {
  authenticator?: Authenticator;
  rateLimiter?: FixedWindowRateLimiter;
  /**
   * Test-only: after auth, use mock PostHog instead of live header credentials.
   * Never enabled in production.
   */
  useMockPostHog?: boolean;
  allowedOrigins?: Set<string>;
  onLog?: (msg: string, meta?: Record<string, unknown>) => void;
};

export type CreateAppResult = {
  fetch: (request: Request) => Promise<Response>;
  authenticator: Authenticator;
  rateLimiter: FixedWindowRateLimiter;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
  if (!origin) return null; // non-browser / no Origin
  if (allowed.size === 0) {
    // No browser origins configured: reject cross-origin browser calls
    return json(403, { error: "Origin not allowed" });
  }
  if (!allowed.has(origin)) {
    return json(403, { error: "Origin not allowed" });
  }
  return null;
}

function resolvePostHogClient(
  request: Request,
  useMockPostHog: boolean,
): { ok: true; client: PostHogClient } | { ok: false; response: Response } {
  if (useMockPostHog) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        response: json(500, { error: "Mock PostHog is not allowed in production" }),
      };
    }
    return { ok: true, client: new MockPostHogClient() };
  }

  const parsed = parsePostHogHeaders(request.headers);
  if (!parsed.ok) {
    return {
      ok: false,
      response: json(parsed.status, { error: parsed.message }),
    };
  }
  return { ok: true, client: createLiveClientFromHeaders(parsed.config) };
}

export function createHttpApp(options: AppOptions = {}): CreateAppResult {
  const authenticator =
    options.authenticator ?? new BearerApiKeyAuthenticator();
  const rateLimiter =
    options.rateLimiter ?? new FixedWindowRateLimiter({ max: 120, windowMs: 60_000 });
  const allowedOrigins =
    options.allowedOrigins ?? parseAllowedOrigins();
  const useMockPostHog = Boolean(options.useMockPostHog);
  const log =
    options.onLog ??
    ((msg: string, meta?: Record<string, unknown>) => {
      if (meta) {
        console.error(`[http] ${msg}`, meta);
      } else {
        console.error(`[http] ${msg}`);
      }
    });

  async function fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === HEALTH_PATH && request.method === "GET") {
      return json(200, { ok: true });
    }

    if (path !== MCP_PATH) {
      return json(404, { error: "Not found" });
    }

    // Origin check for Streamable HTTP (browser)
    const originError = validateOrigin(request, allowedOrigins);
    if (originError) return originError;

    const auth = authenticator.authenticate(
      request.headers.get("authorization"),
    );
    if (!auth.ok) {
      return json(auth.status, { error: auth.message });
    }

    const principal: Principal = auth.principal;
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

    const ph = resolvePostHogClient(request, useMockPostHog);
    if (!ph.ok) return ph.response;

    log("mcp request", {
      method: request.method,
      path,
      principal: principal.id,
      headers: redactHeaders(Object.fromEntries(request.headers.entries())),
    });

    const client = ph.client;
    const mcpHandler = createMcpHandler(
      () => createPostHogMcpServer(client),
      { legacy: "stateless", maxRequestBodySize: 1_000_000 },
    );

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        mcpHandler.fetch(request),
        new Promise<Response>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(Object.assign(new Error("timeout"), { timeout: true })),
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

  return { fetch, authenticator, rateLimiter };
}
