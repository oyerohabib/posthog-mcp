import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { PostHogClient } from "../posthog/types.js";
import { errorResult, textResult } from "./schemas.js";

export function registerProjectTools(server: McpServer, ph: PostHogClient): void {
  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Retrieve current project metadata (id, name, timezone). API tokens are redacted in live mode.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => {
      try {
        return textResult(await ph.getProject());
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_dashboards",
    {
      title: "List dashboards",
      description: "List dashboards in the project (id, name, description, pinned).",
      inputSchema: z.object({
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.listDashboards(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
