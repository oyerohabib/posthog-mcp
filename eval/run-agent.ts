/**
 * Multi-provider agent evaluation (Gemini or Groq; with tools by default).
 *
 * Usage:
 *   npm run eval:agent
 *   npm run eval:agent -- --provider gemini --limit 5
 *   npm run eval:agent -- --provider groq --trials 3 --category events_users
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tasksJson from "./dataset/tasks.json" with { type: "json" };
import type { EvalTask } from "./dataset/schema.js";
import { runTaskTrial, type RunMode } from "./agent/runner.js";
import {
  createLlmClient,
  resolveProviderConfig,
} from "./agent/llm/index.js";
import {
  configureRateLimit,
  paceBetweenTasks,
} from "./agent/rate-limit.js";
import { aggregateMetrics, filterTasks } from "./scoring/metrics.js";
import { writeReports } from "./report.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../.env") });
loadEnv();

function parseArgs(argv: string[]) {
  const out: {
    trials: number;
    limit?: number;
    category?: string;
    mode: RunMode;
    ids?: string[];
    provider?: string;
  } = { trials: 1, mode: "with_tools" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--trials") out.trials = Number(argv[++i]);
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--category") out.category = argv[++i];
    else if (a === "--mode") out.mode = argv[++i] as RunMode;
    else if (a === "--ids") out.ids = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--provider") out.provider = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveProviderConfig({ provider: args.provider });
  const client = createLlmClient(config);
  configureRateLimit({ tpmLimit: config.tpmLimit, label: config.label });
  const tasks = filterTasks(tasksJson as EvalTask[], args);

  console.error(
    `[eval:agent] provider=${config.id} model=${config.model} tpm=${config.tpmLimit} mode=${args.mode} tasks=${tasks.length} trials=${args.trials}`,
  );

  const trials = [];
  let lastPromptTokens = 0;
  for (let trial = 1; trial <= args.trials; trial++) {
    for (const task of tasks) {
      await paceBetweenTasks(lastPromptTokens);
      process.stderr.write(`  ${task.id} trial ${trial}… `);
      try {
        const row = await runTaskTrial({
          task,
          mode: args.mode,
          trial,
          client,
          providerConfig: config,
          model: config.model,
        });
        lastPromptTokens = row.promptTokens;
        trials.push(row);
        console.error(
          row.success
            ? "OK"
            : `FAIL (${row.score.reasons[0] ?? ""})` +
              (row.retries ? ` retries=${row.retries}` : ""),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("ERROR", msg.slice(0, 180));
        lastPromptTokens = Math.max(lastPromptTokens, 2000);
        trials.push({
          taskId: task.id,
          category: task.category,
          mode: args.mode,
          trial,
          success: false,
          latencyMs: 0,
          retries: 0,
          promptTokens: 0,
          completionTokens: 0,
          estimatedCostUsd: 0,
          toolCalls: 0,
          score: {
            success: false,
            toolSelectionCorrect: false,
            argumentCorrect: false,
            mockStateCorrect: false,
            responseCorrect: false,
            clarifyOrRefuseCorrect: false,
            unnecessaryTools: 0,
            invalidTools: 0,
            reasons: [msg],
          },
          finalText: "",
          toolsUsed: [],
        });
      }
    }
  }

  const agg = aggregateMetrics(trials, args.mode);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(here, "reports", `${config.id}-${stamp}`);
  writeReports({ outDir, aggregates: [agg], trials });
  console.log(JSON.stringify({ provider: config.id, model: config.model, ...agg }, null, 2));
  console.error(`[eval:agent] report written to ${outDir}`);
  if (agg.successRate < 0) process.exit(1);
}

main().catch((err) => {
  console.error("[eval:agent] fatal:", err);
  process.exit(1);
});
