/**
 * Compare agent with MCP tools vs without tools (Gemini or Groq).
 *
 * Usage:
 *   npm run eval:compare
 *   npm run eval:compare -- --provider gemini --limit 5 --trials 1
 *   npm run eval:compare -- --provider groq --trials 3 --limit 10
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tasksJson from "./dataset/tasks.json" with { type: "json" };
import type { EvalTask } from "./dataset/schema.js";
import { runTaskTrial } from "./agent/runner.js";
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
    ids?: string[];
    provider?: string;
  } = { trials: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--trials") out.trials = Number(argv[++i]);
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--category") out.category = argv[++i];
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
    `[eval:compare] provider=${config.id} model=${config.model} tpm=${config.tpmLimit} tasks=${tasks.length} trials=${args.trials}`,
  );

  const allTrials = [];
  let lastPromptTokens = 0;
  for (const mode of ["with_tools", "no_tools"] as const) {
    for (let trial = 1; trial <= args.trials; trial++) {
      for (const task of tasks) {
        await paceBetweenTasks(lastPromptTokens);
        process.stderr.write(`  [${mode}] ${task.id} t${trial}… `);
        try {
          const row = await runTaskTrial({
            task,
            mode,
            trial,
            client,
            providerConfig: config,
            model: config.model,
          });
          lastPromptTokens = row.promptTokens;
          allTrials.push(row);
          console.error(
            row.success ? "OK" : `FAIL (${row.score.reasons[0] ?? ""})`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("ERROR", msg.slice(0, 180));
          lastPromptTokens = Math.max(lastPromptTokens, 2000);
          allTrials.push({
            taskId: task.id,
            category: task.category,
            mode,
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
  }

  const withTools = aggregateMetrics(
    allTrials.filter((t) => t.mode === "with_tools"),
    "with_tools",
  );
  const noTools = aggregateMetrics(
    allTrials.filter((t) => t.mode === "no_tools"),
    "no_tools",
  );
  const comparison = {
    provider: config.id,
    model: config.model,
    withTools,
    noTools,
    deltaSuccessRate: withTools.successRate - noTools.successRate,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(here, "reports", `compare-${config.id}-${stamp}`);
  writeReports({
    outDir,
    aggregates: [withTools, noTools],
    trials: allTrials,
    comparison,
  });

  console.log(JSON.stringify(comparison, null, 2));
  console.error(`[eval:compare] report written to ${outDir}`);
}

main().catch((err) => {
  console.error("[eval:compare] fatal:", err);
  process.exit(1);
});
