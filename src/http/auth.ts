/**
 * Authentication abstraction for the remote HTTP MCP entrypoint.
 * Bearer API keys today; OAuth 2.1 can plug in later without rewriting tools.
 */
import { timingSafeEqual } from "node:crypto";

export type Principal = {
  type: "api_key";
  id: string;
  scopes: string[];
};

export type AuthFailure = {
  ok: false;
  status: 401 | 503;
  message: string;
};

export type AuthSuccess = {
  ok: true;
  principal: Principal;
};

export type AuthResult = AuthSuccess | AuthFailure;

export interface Authenticator {
  authenticate(authorizationHeader: string | null | undefined): AuthResult;
}

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep runtime roughly constant when lengths differ.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Single shared bearer key from MCP_API_KEY.
 * Fail closed in production when the key is missing.
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
      };
    }

    if (!authorizationHeader) {
      return { ok: false, status: 401, message: "Unauthorized" };
    }

    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
    if (!match?.[1]) {
      return { ok: false, status: 401, message: "Unauthorized" };
    }

    const token = match[1].trim();
    if (!safeEqualString(token, this.expectedKey)) {
      return { ok: false, status: 401, message: "Unauthorized" };
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
