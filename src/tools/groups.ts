import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { PostHogClient } from "../posthog/types.js";
import { errorResult, textResult } from "./schemas.js";

export function registerGroupTools(server: McpServer, ph: PostHogClient): void {
  server.registerTool(
    "list_group_types",
    {
      title: "List group types",
      description:
        "List configured group types (e.g. company, team) with group_type_index values needed by list_groups/find_group.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => {
      try {
        return textResult(await ph.listGroupTypes());
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_groups",
    {
      title: "List groups",
      description:
        "List groups for a group_type_index (required). Optional search. Call list_group_types first if index is unknown.",
      inputSchema: z.object({
        groupTypeIndex: z
          .number()
          .int()
          .nonnegative()
          .describe("Group type index from list_group_types"),
        search: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.listGroups(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "find_group",
    {
      title: "Find group",
      description: "Find a single group by groupTypeIndex + groupKey.",
      inputSchema: z.object({
        groupTypeIndex: z.number().int().nonnegative(),
        groupKey: z.string().min(1).describe("Group key, e.g. acme"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.findGroup(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
