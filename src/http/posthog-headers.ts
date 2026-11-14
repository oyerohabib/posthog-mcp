/**
 * Per-request PostHog credentials from HTTP headers (remote MCP only).
 */
import {
  createPostHogClient,
  type ClientOptions,
  type PostHogClient,
} from "../posthog/client.js";

export const POSTHOG_HEADER_API_KEY = "x-posthog-api-key";
export const POSTHOG_HEADER_PERSONAL_API_KEY = "x-posthog-personal-api-key";
export const POSTHOG_HEADER_PROJECT_ID = "x-posthog-project-id";
export const POSTHOG_HEADER_HOST = "x-posthog-host";

const DEFAULT_HOST = "https://us.i.posthog.com";

const DEFAULT_ALLOWED_HOSTS = new Set([
  "us.i.posthog.com",
  "eu.i.posthog.com",
  "app.posthog.com",
  "eu.posthog.com",
]);

export type PostHogHeaderConfig = {
  apiKey: string;
  personalApiKey: string;
  projectId: string;
  host: string;
};

export type PostHogHeaderError = {
  ok: false;
  status: 400;
  message: string;
};

export type PostHogHeaderSuccess = {
  ok: true;
  config: PostHogHeaderConfig;
};

export type PostHogHeaderResult = PostHogHeaderSuccess | PostHogHeaderError;

function headerValue(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function allowedPostHogHosts(
  extraEnv: string | undefined = process.env.POSTHOG_ALLOWED_HOSTS,
): Set<string> {
  const set = new Set(DEFAULT_ALLOWED_HOSTS);
  if (extraEnv) {
    for (const part of extraEnv.split(",")) {
      const host = part.trim().toLowerCase();
      if (host) set.add(host);
    }
  }
  return set;
}

/**
 * Validate and normalize a PostHog host URL against the allowlist.
 */
export function validatePostHogHost(
  raw: string | undefined,
  allowed: Set<string> = allowedPostHogHosts(),
): { ok: true; host: string } | { ok: false; message: string } {
  const input = (raw?.trim() || DEFAULT_HOST).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, message: "Invalid X-PostHog-Host" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, message: "X-PostHog-Host must use https" };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { ok: false, message: "Invalid X-PostHog-Host" };
  }
  const hostname = url.hostname.toLowerCase();
  if (!allowed.has(hostname)) {
    return { ok: false, message: "X-PostHog-Host is not an allowed PostHog host" };
  }
  // Only allow root path (or empty)
  if (url.pathname && url.pathname !== "/") {
    return { ok: false, message: "Invalid X-PostHog-Host" };
  }
  return { ok: true, host: `https://${hostname}` };
}

export function parsePostHogHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
  opts?: { allowedHosts?: Set<string> },
): PostHogHeaderResult {
  const apiKey = headerValue(headers, POSTHOG_HEADER_API_KEY)?.trim();
  const personalApiKey = headerValue(
    headers,
    POSTHOG_HEADER_PERSONAL_API_KEY,
  )?.trim();
  const projectId = headerValue(headers, POSTHOG_HEADER_PROJECT_ID)?.trim();
  const hostRaw = headerValue(headers, POSTHOG_HEADER_HOST)?.trim();

  if (!apiKey) {
    return {
      ok: false,
      status: 400,
      message: "Missing X-PostHog-API-Key",
    };
  }
  if (!personalApiKey) {
    return {
      ok: false,
      status: 400,
      message: "Missing X-PostHog-Personal-API-Key",
    };
  }
  if (!projectId) {
    return {
      ok: false,
      status: 400,
      message: "Missing X-PostHog-Project-ID",
    };
  }
  if (!/^\d+$/.test(projectId)) {
    return {
      ok: false,
      status: 400,
      message: "Invalid X-PostHog-Project-ID",
    };
  }

  const hostResult = validatePostHogHost(hostRaw, opts?.allowedHosts);
  if (!hostResult.ok) {
    return { ok: false, status: 400, message: hostResult.message };
  }

  return {
    ok: true,
    config: {
      apiKey,
      personalApiKey,
      projectId,
      host: hostResult.host,
    },
  };
}

/** Build a live PostHog client from validated header config. */
export function createLiveClientFromHeaders(
  config: PostHogHeaderConfig,
): PostHogClient {
  const options: ClientOptions = {
    mode: "live",
    apiKey: config.apiKey,
    personalApiKey: config.personalApiKey,
    projectId: config.projectId,
    host: config.host,
  };
  return createPostHogClient(options);
}
