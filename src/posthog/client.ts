import { LivePostHogClient } from "./live/index.js";
import { MockPostHogClient } from "./mock/index.js";
import type { PostHogClient, PostHogMode } from "./types.js";

export type ClientOptions = {
  /** Force mode. Default: mock unless POSTHOG_MODE=live. */
  mode?: PostHogMode;
  apiKey?: string;
  host?: string;
  personalApiKey?: string;
  projectId?: string;
};

/**
 * Resolve mock vs live client.
 * Default is mock so agents can run without credentials.
 * Set POSTHOG_MODE=live and POSTHOG_API_KEY to hit a real project.
 */
export function createPostHogClient(options: ClientOptions = {}): PostHogClient {
  const envMode = (process.env.POSTHOG_MODE ?? "").toLowerCase();
  const apiKey = options.apiKey ?? process.env.POSTHOG_API_KEY ?? "";
  const host =
    options.host ?? process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  const personalApiKey =
    options.personalApiKey ?? process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = options.projectId ?? process.env.POSTHOG_PROJECT_ID;

  let mode: PostHogMode;
  if (options.mode) {
    mode = options.mode;
  } else if (envMode === "live" || envMode === "mock") {
    mode = envMode;
  } else {
    mode = "mock";
  }

  if (mode === "live") {
    return new LivePostHogClient({ apiKey, host, personalApiKey, projectId });
  }

  return new MockPostHogClient();
}

export { MockPostHogClient } from "./mock/index.js";
export { LivePostHogClient } from "./live/index.js";
export { PostHogValidationError } from "./errors.js";
export type * from "./types.js";
