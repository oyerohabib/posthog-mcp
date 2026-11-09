import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { JsonObject, PostHogClient } from "../posthog/types.js";
import { errorResult, jsonObjectSchema, textResult } from "./schemas.js";

export function registerFlagTools(server: McpServer, ph: PostHogClient): void {
  server.registerTool(
    "get_feature_flag",
    {
      title: "Get feature flag",
      description:
        "Evaluate a PostHog feature flag for a distinct_id. Returns value (boolean|string|null) and enabled. In mock mode, seeded flags: new-onboarding=true, beta-insights=false, pricing-experiment=\"control\". Override via personProperties.$feature/<flagKey>.",
      inputSchema: z.object({
        distinctId: z.string().min(1).describe("User id to evaluate the flag for"),
        flagKey: z.string().min(1).describe("Feature flag key"),
        personProperties: jsonObjectSchema
          .optional()
          .describe("Optional person properties for evaluation / mock overrides"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ distinctId, flagKey, personProperties }) => {
      try {
        const result = await ph.getFeatureFlag({
          distinctId,
          flagKey,
          personProperties: personProperties as JsonObject | undefined,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_feature_flags",
    {
      title: "List feature flags",
      description:
        "List known feature flags (key, active, id, name). Mock returns seeded flags. Live needs personal API key + project id (otherwise returns empty list for backward compatibility).",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => {
      try {
        return textResult(await ph.listFeatureFlags());
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_feature_flag_definition",
    {
      title: "Get feature flag definition",
      description:
        "Retrieve full feature flag definition by key or numeric id (filters, rollout, active).",
      inputSchema: z.object({
        key: z.string().optional().describe("Flag key"),
        id: z.number().int().optional().describe("Flag numeric id"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.getFeatureFlagDefinition(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "create_feature_flag",
    {
      title: "Create feature flag",
      description:
        "Create a feature flag. SAFETY: requires confirm=true. Prefer read tools unless the user explicitly asks to create a flag.",
      inputSchema: z.object({
        key: z.string().min(1).describe("Unique flag key"),
        name: z.string().optional().describe("Display name"),
        active: z.boolean().optional().describe("Whether the flag is active"),
        rolloutPercentage: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("Rollout percentage 0-100"),
        confirm: z
          .boolean()
          .describe("Must be true to proceed with creating the flag"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.createFeatureFlag(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "update_feature_flag",
    {
      title: "Update feature flag",
      description:
        "Update a feature flag's name, active state, or rollout. Identify by key or id. SAFETY: requires confirm=true.",
      inputSchema: z.object({
        key: z.string().optional().describe("Flag key"),
        id: z.number().int().optional().describe("Flag numeric id"),
        name: z.string().optional(),
        active: z.boolean().optional(),
        rolloutPercentage: z.number().min(0).max(100).optional(),
        confirm: z
          .boolean()
          .describe("Must be true to proceed with updating the flag"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.updateFeatureFlag(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
