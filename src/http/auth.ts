/**
 * Authentication abstraction for the remote HTTP MCP entrypoint.
 * Bearer API keys (ops) + OAuth JWT (WorkOS AuthKit) for normal clients.
 */
import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type Principal = {
  type: "api_key" | "oauth";
  id: string;
  scopes: string[];
  email?: string | null;
  workosUserId?: string;
};

export type AuthFailure = {
  ok: false;
  status: 401 | 503;
  message: string;
  /** When true, respond with MCP OAuth WWW-Authenticate challenge */
  oauthChallenge?: boolean;
};

export type AuthSuccess = {
  ok: true;
  principal: Principal;
};

export type AuthResult = AuthSuccess | AuthFailure;

export interface Authenticator {
  authenticate(
    authorizationHeader: string | null | undefined,
  ): AuthResult | Promise<AuthResult>;
}

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Single shared bearer key from MCP_API_KEY (ops / CI escape hatch).
 */
export class BearerApiKeyAuthenticator implements Authenticator {
  private readonly expectedKey: string | undefined;
  private readonly isProduction: boolean;

  constructor(opts?: { apiKey?: string; nodeEnv?: string }) {
    this.expectedKey = opts?.apiKey ?? process.env.MCP_API_KEY;
    this.isProduction =
      (opts?.nodeEnv ?? process.env.NODE_ENV ?? "").toLowerCase() ===
      "production";
  }

  authenticate(authorizationHeader: string | null | undefined): AuthResult {
    if (!this.expectedKey) {
      if (this.isProduction) {
        return {
          ok: false,
          status: 503,
          message: "Authentication is not configured",
        };
      }
      return {
        ok: false,
        status: 401,
        message: "Unauthorized",
        oauthChallenge: true,
      };
    }

    if (!authorizationHeader) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized",
        oauthChallenge: true,
      };
    }

    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
    if (!match?.[1]) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized",
        oauthChallenge: true,
      };
    }

    const token = match[1].trim();
    if (!safeEqualString(token, this.expectedKey)) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized",
        oauthChallenge: true,
      };
    }

    return {
      ok: true,
      principal: {
        type: "api_key",
        id: "default",
        scopes: ["mcp"],
      },
    };
  }
}

export type WorkOSJwtOptions = {
  /** AuthKit domain, e.g. https://xxx.authkit.app */
  authkitDomain?: string;
  /** Expected JWT audience (MCP resource URL) */
  audience?: string;
  /** Inject JWKS for tests */
  jwks?: ReturnType<typeof createRemoteJWKSet>;
  /** Test-only: verify with a shared secret HS256 instead of JWKS */
  testHmacSecret?: string | Uint8Array;
};

/**
 * Validate WorkOS AuthKit access tokens (MCP resource server).
 */
export class WorkOSJwtAuthenticator implements Authenticator {
  private readonly authkitDomain: string;
  private readonly audience: string;
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly testHmacSecret?: Uint8Array;

  constructor(opts: WorkOSJwtOptions = {}) {
    this.authkitDomain = (
      opts.authkitDomain ??
      process.env.WORKOS_AUTHKIT_DOMAIN ??
      ""
    ).replace(/\/$/, "");
    this.audience =
      opts.audience ??
      process.env.MCP_RESOURCE_URL ??
      "";
    this.jwks = opts.jwks;
    this.testHmacSecret = opts.testHmacSecret
      ? typeof opts.testHmacSecret === "string"
        ? new TextEncoder().encode(opts.testHmacSecret)
        : opts.testHmacSecret
      : process.env.OAUTH_TEST_HMAC_SECRET
        ? new TextEncoder().encode(process.env.OAUTH_TEST_HMAC_SECRET)
        : undefined;
  }

  get configured(): boolean {
    return Boolean(this.testHmacSecret || (this.authkitDomain && this.audience));
  }

  async authenticate(
    authorizationHeader: string | null | undefined,
  ): Promise<AuthResult> {
    if (!this.configured) {
      return {
        ok: false,
        status: 503,
        message: "OAuth is not configured",
      };
    }
    if (!authorizationHeader) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized",
        oauthChallenge: true,
      };
    }
    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
    if (!match?.[1]) {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized",
        oauthChallenge: true,
      };
    }
    const token = match[1].trim();
    try {
      let payload: JWTPayload;
      if (this.testHmacSecret) {
        const verified = await jwtVerify(token, this.testHmacSecret, {
          audience: this.audience || undefined,
        });
        payload = verified.payload;
      } else {
        const jwks =
          this.jwks ??
          createRemoteJWKSet(
            new URL(`${this.authkitDomain}/oauth2/jwks`),
          );
        const verified = await jwtVerify(token, jwks, {
          audience: this.audience,
          issuer: this.authkitDomain,
        });
        payload = verified.payload;
      }
      const sub = typeof payload.sub === "string" ? payload.sub : "";
      if (!sub) {
        return {
          ok: false,
          status: 401,
          message: "Unauthorized",
          oauthChallenge: true,
        };
      }
      const email =
        typeof payload.email === "string" ? payload.email : null;
      const scopeStr =
        typeof payload.scope === "string"
          ? payload.scope
          : typeof payload.scp === "string"
            ? payload.scp
            : "";
      const scopes = scopeStr
        ? scopeStr.split(/\s+/).filter(Boolean)
        : ["mcp"];
      return {
        ok: true,
        principal: {
          type: "oauth",
          id: sub,
          workosUserId: sub,
          email,
          scopes,
        },
      };
    } catch {
      return {
        ok: false,
        status: 401,
        message: "Unauthorized",
        oauthChallenge: true,
      };
    }
  }
}

/**
 * Try OAuth JWT first (when configured), then legacy API key.
 */
export class CompositeAuthenticator implements Authenticator {
  constructor(
    private readonly oauth: WorkOSJwtAuthenticator | null,
    private readonly apiKey: BearerApiKeyAuthenticator,
  ) {}

  async authenticate(
    authorizationHeader: string | null | undefined,
  ): Promise<AuthResult> {
    if (this.oauth?.configured) {
      const oauthResult = await this.oauth.authenticate(authorizationHeader);
      if (oauthResult.ok) return oauthResult;
      // Fall through to API key for ops/CI
      const keyResult = this.apiKey.authenticate(authorizationHeader);
      if (keyResult.ok) return keyResult;
      return oauthResult;
    }
    return this.apiKey.authenticate(authorizationHeader);
  }
}

export function createDefaultAuthenticator(): Authenticator {
  const oauth = new WorkOSJwtAuthenticator();
  const apiKey = new BearerApiKeyAuthenticator();
  return new CompositeAuthenticator(
    oauth.configured ? oauth : null,
    apiKey,
  );
}

/** Redact sensitive header values for logs. */
export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const sensitive = new Set([
    "authorization",
    "x-posthog-api-key",
    "x-posthog-personal-api-key",
  ]);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const joined = Array.isArray(value) ? value.join(",") : (value ?? "");
    out[key] = sensitive.has(key.toLowerCase()) ? "[REDACTED]" : joined;
  }
  return out;
}

export function oauthWwwAuthenticate(
  resourceMetadataUrl: string,
  scope = "openid profile email",
): string {
  return `Bearer realm="mcp", resource_metadata="${resourceMetadataUrl}", scope="${scope}"`;
}
