import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { PostHogClient } from "../posthog/types.js";
import { errorResult, textResult } from "./schemas.js";

export function registerInsightTools(server: McpServer, ph: PostHogClient): void {
  server.registerTool(
    "query_trends",
    {
      title: "Query trends",
      description:
        "Run a trends query for a single event (counts over time). Optional dateFrom/dateTo and interval (hour|day|week|month).",
      inputSchema: z.object({
        event: z.string().min(1).describe("Event name to count"),
        dateFrom: z.string().optional().describe("ISO date or relative like -7d"),
        dateTo: z.string().optional(),
        interval: z.enum(["hour", "day", "week", "month"]).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.queryTrends(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "query_funnel",
    {
      title: "Query funnel",
      description:
        "Run a funnel query for an ordered list of event names. Returns per-step counts and conversion rates.",
      inputSchema: z.object({
        events: z
          .array(z.string().min(1))
          .min(1)
          .describe("Ordered funnel step event names"),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.queryFunnel(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "query_retention",
    {
      title: "Query retention",
      description:
        "Run a retention query. Optional targetEvent/returningEvent (default $pageview) and period Day|Week|Month.",
      inputSchema: z.object({
        targetEvent: z.string().optional(),
        returningEvent: z.string().optional(),
        dateFrom: z.string().optional(),
        period: z.enum(["Day", "Week", "Month"]).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.queryRetention(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_insights",
    {
      title: "List insights",
      description: "List saved insights. Optional search by name/description.",
      inputSchema: z.object({
        search: z.string().optional(),
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.listInsights(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_insight",
    {
      title: "Get insight",
      description: "Retrieve a saved insight by numeric id.",
      inputSchema: z.object({
        id: z.number().int().describe("Insight id"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ id }) => {
      try {
        return textResult(await ph.getInsight({ id }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
