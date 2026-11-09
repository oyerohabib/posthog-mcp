import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { JsonObject, PostHogClient } from "../posthog/types.js";
import { errorResult, jsonObjectSchema, textResult } from "./schemas.js";

export function registerEventTools(server: McpServer, ph: PostHogClient): void {
  server.registerTool(
    "capture_event",
    {
      title: "Capture event",
      description:
        "Capture a PostHog analytics event for a distinct_id. Use for product telemetry agents emit (signup, feature_used, error). Required: distinctId, event. Optional: properties object.",
      inputSchema: z.object({
        distinctId: z
          .string()
          .min(1)
          .describe("Stable user/device id (PostHog distinct_id)"),
        event: z.string().min(1).describe("Event name, e.g. user_signed_up"),
        properties: jsonObjectSchema
          .optional()
          .describe("Arbitrary JSON properties attached to the event"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ distinctId, event, properties }) => {
      try {
        const result = await ph.captureEvent({
          distinctId,
          event,
          properties: properties as JsonObject | undefined,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
