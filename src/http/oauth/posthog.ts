/**
 * PostHog OAuth (CIMD) helpers — authorize, token, refresh, region probe.
 */
import { createHash, randomBytes } from "node:crypto";

export const POSTHOG_OAUTH_ISSUER = "https://oauth.posthog.com";
export const POSTHOG_AUTHORIZE = `${POSTHOG_OAUTH_ISSUER}/oauth/authorize/`;
export const POSTHOG_TOKEN = `${POSTHOG_OAUTH_ISSUER}/oauth/token/`;
export const POSTHOG_REVOKE = `${POSTHOG_OAUTH_ISSUER}/oauth/revoke/`;
export const POSTHOG_USERINFO = `${POSTHOG_OAUTH_ISSUER}/oauth/userinfo/`;

export const POSTHOG_SCOPES = [
  "openid",
  "profile",
  "email",
  "project:read",
  "query:read",
  "insight:read",
  "person:read",
  "feature_flag:read",
  "feature_flag:write",
  "experiment:read",
  "cohort:read",
  "group:read",
  "dashboard:read",
] as const;

export function posthogClientIdUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/oauth/posthog-client`;
}

export function posthogCallbackUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/oauth/posthog/callback`;
}

export function posthogCimdDocument(baseUrl: string): Record<string, unknown> {
  const clientId = posthogClientIdUrl(baseUrl);
  return {
    client_id: clientId,
    client_name: "Analytics MCP",
    redirect_uris: [posthogCallbackUrl(baseUrl)],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    "com.posthog": {
      scopes: [...POSTHOG_SCOPES],
      optional_scopes: [],
    },
  };
}

export function generatePkce(): {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
} {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const state = randomBytes(16).toString("base64url");
  return { codeVerifier, codeChallenge, state };
}

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
}): string {
  const u = new URL(POSTHOG_AUTHORIZE);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set(
    "scope",
    (opts.scopes ?? [...POSTHOG_SCOPES]).join(" "),
  );
  return u.toString();
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export async function exchangeAuthorizationCode(opts: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(POSTHOG_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(opts: {
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: opts.clientId,
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(POSTHOG_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog refresh failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(POSTHOG_REVOKE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

export type RegionHosts = {
  region: "us" | "eu";
  appHost: string;
  captureHost: string;
};

/** Probe US then EU with the access token. */
export async function probePostHogRegion(
  accessToken: string,
): Promise<RegionHosts> {
  for (const region of ["us", "eu"] as const) {
    const appHost = `https://${region}.posthog.com`;
    try {
      const res = await fetch(`${appHost}/api/users/@me/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        return {
          region,
          appHost,
          captureHost: `https://${region}.i.posthog.com`,
        };
      }
    } catch {
      // try next
    }
  }
  // Default US if probe fails (caller may still fail on API use)
  return {
    region: "us",
    appHost: "https://us.posthog.com",
    captureHost: "https://us.i.posthog.com",
  };
}

export type PostHogProject = {
  id: number | string;
  name: string;
  api_token?: string;
};

export async function listProjects(
  appHost: string,
  accessToken: string,
): Promise<PostHogProject[]> {
  const res = await fetch(`${appHost.replace(/\/$/, "")}/api/projects/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`list projects failed: ${res.status}`);
  }
  const data: unknown = await res.json();
  if (Array.isArray(data)) return data as PostHogProject[];
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { results?: unknown }).results)
  ) {
    return (data as { results: PostHogProject[] }).results;
  }
  return [];
}

export async function getProject(
  appHost: string,
  accessToken: string,
  projectId: string,
): Promise<PostHogProject> {
  const res = await fetch(
    `${appHost.replace(/\/$/, "")}/api/projects/${projectId}/`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`get project failed: ${res.status}`);
  }
  return (await res.json()) as PostHogProject;
}
