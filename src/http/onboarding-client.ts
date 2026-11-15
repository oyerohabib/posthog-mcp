/**
 * Stub PostHog client used when MCP OAuth succeeded but PostHog is not connected yet.
 * Lets initialize / tools/list succeed so Cursor stays connected; tool calls surface the URL.
 */
import type { PostHogClient, PostHogMode } from "../posthog/types.js";
import { PostHogAuthError } from "../posthog/errors.js";

export function createOnboardingRequiredClient(
  onboardingUrl: string,
): PostHogClient {
  const message = `PostHog connection required. Call get_setup_status for status and connectUrl, or open ${onboardingUrl}`;

  return new Proxy(
    { mode: "live" as PostHogMode },
    {
      get(target, prop) {
        if (prop === "mode") return target.mode;
        if (typeof prop === "symbol") return undefined;
        return async () => {
          throw new PostHogAuthError(message);
        };
      },
    },
  ) as PostHogClient;
}
