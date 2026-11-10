import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AggregateReport, TrialMetrics } from "./scoring/metrics.js";

export function writeReports(opts: {
  outDir: string;
  aggregates: AggregateReport[];
  trials: TrialMetrics[];
  comparison?: {
    withTools: AggregateReport;
    noTools: AggregateReport;
    deltaSuccessRate: number;
  };
}): string {
  mkdirSync(opts.outDir, { recursive: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    aggregates: opts.aggregates,
    comparison: opts.comparison,
    trials: opts.trials.map((t) => ({
      ...t,
      // avoid huge dumps; keep reasons
    })),
  };
  writeFileSync(join(opts.outDir, "summary.json"), JSON.stringify(summary, null, 2));

  const lines: string[] = [];
  lines.push("# PostHog MCP Agent Evaluation Report");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push("");

  for (const agg of opts.aggregates) {
    lines.push(`## Mode: ${agg.mode}`);
    lines.push("");
    lines.push(`- Tasks: ${agg.taskCount}`);
    lines.push(`- Success rate: ${(agg.successRate * 100).toFixed(1)}%`);
    lines.push(`- Avg latency: ${agg.avgLatencyMs.toFixed(0)} ms`);
    lines.push(
      `- Tokens: ${agg.totalPromptTokens} prompt / ${agg.totalCompletionTokens} completion`,
    );
    lines.push(`- Estimated cost: $${agg.estimatedCostUsd.toFixed(4)}`);
    if (agg.mode.includes("with")) {
      lines.push(
        `- Tool selection accuracy: ${(agg.toolSelectionAccuracy * 100).toFixed(1)}%`,
      );
      lines.push(
        `- Argument accuracy: ${(agg.argumentAccuracy * 100).toFixed(1)}%`,
      );
    }
    lines.push("");
    lines.push("### By category");
    for (const [cat, stats] of Object.entries(agg.byCategory)) {
      lines.push(
        `- ${cat}: ${(stats.successRate * 100).toFixed(1)}% (${stats.n} runs)`,
      );
    }
    lines.push("");
  }

  if (opts.comparison) {
    lines.push("## With-tools vs no-tools");
    lines.push("");
    lines.push(
      `- Success rate delta (with - without): ${(opts.comparison.deltaSuccessRate * 100).toFixed(1)} pp`,
    );
    lines.push(
      `- With tools: ${(opts.comparison.withTools.successRate * 100).toFixed(1)}%`,
    );
    lines.push(
      `- Without tools: ${(opts.comparison.noTools.successRate * 100).toFixed(1)}%`,
    );
    lines.push("");
  }

  lines.push("## Failed trials");
  lines.push("");
  const failed = opts.trials.filter((t) => !t.success);
  if (!failed.length) {
    lines.push("_None_");
  } else {
    for (const t of failed.slice(0, 50)) {
      lines.push(
        `- ${t.taskId} [${t.mode} trial ${t.trial}]: ${t.score.reasons.join("; ") || "failed"}`,
      );
    }
    if (failed.length > 50) lines.push(`- …and ${failed.length - 50} more`);
  }

  writeFileSync(join(opts.outDir, "summary.md"), lines.join("\n"));
  return opts.outDir;
}
