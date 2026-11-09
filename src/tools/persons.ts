import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { JsonObject, PostHogClient } from "../posthog/types.js";
import { errorResult, jsonObjectSchema, textResult } from "./schemas.js";

export function registerPersonTools(server: McpServer, ph: PostHogClient): void {
  server.registerTool(
    "identify_user",
    {
      title: "Identify user",
      description:
        "Identify or update a PostHog person by distinct_id with $set-style properties (email, name, plan). Required: distinctId, properties (non-empty object).",
      inputSchema: z.object({
        distinctId: z.string().min(1).describe("Stable user id to identify"),
        properties: jsonObjectSchema
          .refine((o) => Object.keys(o).length > 0, {
            message: "properties must include at least one key",
          })
          .describe("Person properties to $set, e.g. { email, plan }"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ distinctId, properties }) => {
      try {
        const result = await ph.identifyUser({
          distinctId,
          properties: properties as JsonObject,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_person",
    {
      title: "Get person",
      description:
        "Retrieve a PostHog person by distinct_id, including properties and linked distinct ids. Returns person:null when not found.",
      inputSchema: z.object({
        distinctId: z.string().min(1).describe("Distinct id to look up"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ distinctId }) => {
      try {
        return textResult(await ph.getPerson({ distinctId }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_persons",
    {
      title: "List persons",
      description:
        "List or search PostHog persons. Optional search matches email, name, distinct ids, and properties.",
      inputSchema: z.object({
        search: z.string().optional().describe("Search string"),
        limit: z.number().int().positive().max(1000).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.listPersons(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_person_events",
    {
      title: "Get person events",
      description:
        "List recent events for a distinct_id, newest first. Optional event name filter.",
      inputSchema: z.object({
        distinctId: z.string().min(1).describe("Distinct id"),
        limit: z.number().int().positive().max(500).optional(),
        event: z.string().optional().describe("Filter to a single event name"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        return textResult(await ph.getPersonEvents(args));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
