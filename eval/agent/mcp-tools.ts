import type { Client } from "@modelcontextprotocol/client";
import type { ChatTool } from "./llm/types.js";

/**
 * Shrink recursive JSON Schema ($defs / deep anyOf) that Zod emits for JsonObject.
 * Keeps names + required keys for the model while cutting thousands of TPM tokens.
 */
function compactSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(schema);
  delete clone.$schema;
  delete clone.$defs;
  delete clone.definitions;

  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);

    const obj = node as Record<string, unknown>;
    if (obj.$ref) {
      return { type: "object", additionalProperties: true };
    }

    // Collapse Zod-style giant anyOf unions for JSON values into a loose object/primitive.
    if (Array.isArray(obj.anyOf) && obj.anyOf.length >= 4) {
      return {}; // unconstrained JSON value
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "$defs" || k === "definitions" || k === "$schema") continue;
      if (k === "additionalProperties" && typeof v === "object") {
        out[k] = true;
        continue;
      }
      if (k === "propertyNames") continue;
      out[k] = walk(v);
    }
    return out;
  };

  return walk(clone) as Record<string, unknown>;
}

/**
 * Convert MCP tool list entries into OpenAI/Groq function tool definitions.
 * Reuses live MCP tool names/required fields; schemas are compacted for TPM.
 */
export function mcpToolsToOpenAI(
  tools: Awaited<ReturnType<Client["listTools"]>>["tools"],
): ChatTool[] {
  return tools.map((tool) => {
    const raw = (tool.inputSchema ?? {
      type: "object",
      properties: {},
    }) as Record<string, unknown>;
    const parameters = compactSchema(raw);
    const description = (tool.description ?? tool.title ?? tool.name).slice(
      0,
      280,
    );
    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description,
        parameters,
      },
    };
  });
}

export async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean; data: unknown }> {
  const raw = await client.callTool({ name, arguments: args });
  const text =
    raw.content?.find((c) => c.type === "text")?.text ??
    JSON.stringify(raw.structuredContent ?? {});
  let data: unknown = raw.structuredContent ?? {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { text, isError: Boolean(raw.isError), data };
}
