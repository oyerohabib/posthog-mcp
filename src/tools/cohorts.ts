import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { PostHogClient } from "../posthog/types.js";
import { errorResult, textResult } from "./schemas.js";

export function registerCohortTools(server: McpServer, ph: PostHogClient): void {
  server.registerTool(
    "list_cohorts",
    {
      title: "List cohorts",
      description: "List PostHog cohorts (name, count, static/dynamic).",
      inputSchema: z.object({
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.listCohorts(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_cohort",
    {
      title: "Get cohort",
      description: "Retrieve cohort details by numeric id.",
      inputSchema: z.object({
        id: z.number().int().describe("Cohort id"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ id }) => {
      try {
        return textResult(await ph.getCohort({ id }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_cohort_persons",
    {
      title: "Get cohort persons",
      description: "List persons belonging to a cohort by cohort id.",
      inputSchema: z.object({
        id: z.number().int().describe("Cohort id"),
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.getCohortPersons(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
