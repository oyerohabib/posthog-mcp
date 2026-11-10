import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createPostHogMcpServer } from "../../src/server.js";
import { MockPostHogClient } from "../../src/posthog/mock.js";
import type { EvalTask } from "../dataset/schema.js";
import {
  createLlmClient,
  estimateCostUsd,
  resolveProviderConfig,
  type ChatMessage,
  type LlmClient,
  type ProviderConfig,
  type ProviderId,
} from "./llm/index.js";
import { callMcpTool, mcpToolsToOpenAI } from "./mcp-tools.js";
import { SYSTEM_PROMPT_NO_TOOLS, SYSTEM_PROMPT_WITH_TOOLS } from "./prompts.js";
import {
  awaitTpmBudget,
  backoffForError,
  isTransientLlmError,
  recordTokenUsage,
} from "./rate-limit.js";
import type { TrialMetrics } from "../scoring/metrics.js";
import { scoreTask, type RecordedToolCall } from "../scoring/validators.js";

export type RunMode = "with_tools" | "no_tools";

const MAX_STEPS = 8;
const MAX_API_ATTEMPTS = 6;

export async function runTaskTrial(opts: {
  task: EvalTask;
  mode: RunMode;
  trial: number;
  client?: LlmClient;
  providerConfig?: ProviderConfig;
  model?: string;
}): Promise<TrialMetrics> {
  const config = opts.providerConfig ?? resolveProviderConfig();
  const client = opts.client ?? createLlmClient(config);
  const model = opts.model ?? config.model;
  const providerId: ProviderId = config.id;

  const mock = new MockPostHogClient();
  const server = createPostHogMcpServer(mock);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "posthog-agent-eval", version: "1.0.0" });
  await server.connect(serverTransport);
  await mcp.connect(clientTransport);

  const toolCalls: RecordedToolCall[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let retries = 0;
  const started = Date.now();
  let finalText = "";

  try {
    const listed = await mcp.listTools();
    const tools =
      opts.mode === "with_tools" ? mcpToolsToOpenAI(listed.tools) : undefined;

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          opts.mode === "with_tools"
            ? SYSTEM_PROMPT_WITH_TOOLS
            : SYSTEM_PROMPT_NO_TOOLS,
      },
      { role: "user", content: opts.task.prompt },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      let completion:
        | Awaited<ReturnType<LlmClient["chat"]["completions"]["create"]>>
        | undefined;
      const estimate = opts.mode === "with_tools" ? 2500 : 800;
      for (let attempt = 0; attempt < MAX_API_ATTEMPTS; attempt++) {
        try {
          await awaitTpmBudget(estimate);
          completion = await client.chat.completions.create({
            model,
            messages,
            tools: tools?.length ? tools : undefined,
            tool_choice: tools?.length ? "auto" : undefined,
            temperature: 0.2,
          });
          break;
        } catch (err) {
          retries += 1;
          if (attempt === MAX_API_ATTEMPTS - 1) throw err;
          if (isTransientLlmError(err)) {
            await backoffForError(err, attempt);
            continue;
          }
          throw err;
        }
      }

      if (!completion) throw new Error("empty completion");
      const pt = completion.usage?.prompt_tokens ?? 0;
      const ct = completion.usage?.completion_tokens ?? 0;
      promptTokens += pt;
      completionTokens += ct;
      recordTokenUsage(pt, ct);

      const choice = completion.choices[0]?.message;
      if (!choice) {
        finalText = "";
        break;
      }

      const rawToolCalls = choice.tool_calls ?? [];
      if (rawToolCalls.length > 0 && opts.mode === "with_tools") {
        messages.push({
          role: "assistant",
          content: choice.content ?? null,
          tool_calls: rawToolCalls,
        });

        const tc = rawToolCalls[0]!;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<
            string,
            unknown
          >;
        } catch {
          args = {};
        }
        const result = await callMcpTool(mcp, tc.function.name, args);
        toolCalls.push({
          name: tc.function.name,
          arguments: args,
          isError: result.isError,
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result.text,
        });

        for (const extra of rawToolCalls.slice(1)) {
          toolCalls.push({
            name: extra.function.name,
            arguments: {},
            isError: true,
          });
          messages.push({
            role: "tool",
            tool_call_id: extra.id,
            content: JSON.stringify({
              ok: false,
              error: "parallel_tool_calls_unsupported",
              message:
                "This model does not support parallel tool calls; call tools one at a time.",
            }),
          });
        }
        continue;
      }

      finalText = choice.content?.trim() ?? "";
      break;
    }
  } finally {
    await mcp.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  const latencyMs = Date.now() - started;
  const score = scoreTask({
    task: opts.task,
    finalText,
    toolCalls,
    mock,
    toolsEnabled: opts.mode === "with_tools",
  });

  return {
    taskId: opts.task.id,
    category: opts.task.category,
    mode: opts.mode,
    trial: opts.trial,
    success: score.success,
    latencyMs,
    retries,
    promptTokens,
    completionTokens,
    estimatedCostUsd: estimateCostUsd(providerId, {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    }),
    toolCalls: toolCalls.length,
    score,
    finalText,
    toolsUsed: toolCalls.map((t) => t.name),
  };
}
