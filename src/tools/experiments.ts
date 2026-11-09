import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { PostHogClient } from "../posthog/types.js";
import { errorResult, textResult } from "./schemas.js";

export function registerExperimentTools(server: McpServer, ph: PostHogClient): void {
  server.registerTool(
    "list_experiments",
    {
      title: "List experiments",
      description:
        "List PostHog experiments. Optional status filter: draft, running, complete, stopped, etc.",
      inputSchema: z.object({
        status: z.string().optional().describe("Experiment status filter"),
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.listExperiments(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_experiment",
    {
      title: "Get experiment",
      description:
        "Retrieve one experiment by numeric id, including status, linked flag key, and metrics.",
      inputSchema: z.object({
        id: z.number().int().describe("Experiment id"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ id }) => {
      try {
        return textResult(await ph.getExperiment({ id }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
