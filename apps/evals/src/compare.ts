import "./load-env";

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Runs the same eval suite once per model and puts the results side by side:
 * pass rate, cost per reply, latency and judge scores. Sequential on purpose —
 * each run's cleanup deletes the eval bookings, so two at once would trip over
 * each other.
 *
 *   pnpm --filter evals eval:compare
 *   pnpm --filter evals eval:compare -- --models=openrouter/deepseek/deepseek-v3.2,openrouter/anthropic/claude-haiku-5.5
 *
 * The HTTP surface is left out: it talks to the running API, which answers
 * with whatever OPENROUTER_MODEL the server was started with, not the model
 * under test. The router surface runs the same code in-process.
 */

const DEFAULT_MODELS = ["openrouter/deepseek/deepseek-v3.2", "openrouter/anthropic/claude-haiku-5.5"];
const SURFACES = "concierge,concierge-router,booking-agent,whatsapp";

type Outcome = {
  caseId: string;
  surface: string;
  status: "pass" | "fail" | "error" | "skipped";
  latencyMs?: number;
  costUsd?: number;
  modelId?: string;
  checks: { name: string; passed: boolean; severity: string; detail?: string }[];
  judgement?: { relevance: number; accuracy: number; helpfulness: number; tone: number };
};

type ModelResult = {
  model: string;
  served: string[];
  replies: number;
  passed: number;
  failed: string[];
  errors: number;
  /** Failures whose only failing check is the exact model-id match. */
  identityOnly: number;
  costUsd: number;
  costedReplies: number;
  latencies: number[];
  scores: { relevance: number; accuracy: number; helpfulness: number; tone: number } | undefined;
};

const reportsDir = fileURLToPath(new URL("../reports/", import.meta.url));

function argValue(flag: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${flag}=`))?.slice(flag.length + 3);
}

/** A dead key otherwise shows up as a wall of 401s, one per case. */
async function checkKey(): Promise<void> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set in apps/server/.env.");
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) {
    throw new Error(
      `OpenRouter refused OPENROUTER_API_KEY (HTTP ${response.status}). Put a working key in apps/server/.env and run this again.`,
    );
  }
}

/** The JSON report the run just wrote (run.ts names them by timestamp). */
async function newestReport(after: number): Promise<string> {
  const written = [];
  for (const file of await readdir(reportsDir)) {
    if (!/^\d{4}-.*\.json$/.test(file)) continue;
    const { mtimeMs } = await stat(`${reportsDir}${file}`);
    if (mtimeMs >= after) written.push({ file, mtimeMs });
  }
  const newest = written.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!newest) throw new Error("The eval run wrote no report.");
  return `${reportsDir}${newest.file}`;
}

async function runModel(model: string, extraArgs: string[]): Promise<ModelResult> {
  console.log(`\n=== ${model} ===`);
  const startedAt = Date.now();
  const child = Bun.spawn(["bun", "run", "src/run.ts", `--surface=${SURFACES}`, ...extraArgs], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, OPENROUTER_MODEL: model },
    stdout: "inherit",
    stderr: "inherit",
  });
  await child.exited;
  const { outcomes } = JSON.parse(await readFile(await newestReport(startedAt), "utf8")) as { outcomes: Outcome[] };

  const judged = outcomes.flatMap((outcome) => (outcome.judgement ? [outcome.judgement] : []));
  const mean = (pick: (j: NonNullable<Outcome["judgement"]>) => number) =>
    judged.reduce((sum, j) => sum + pick(j), 0) / judged.length;
  const costed = outcomes.filter((outcome) => typeof outcome.costUsd === "number");

  return {
    model,
    served: [...new Set(outcomes.map((outcome) => outcome.modelId).filter((id): id is string => Boolean(id)))],
    replies: outcomes.length,
    passed: outcomes.filter((outcome) => outcome.status === "pass").length,
    failed: outcomes.filter((outcome) => outcome.status === "fail").map((outcome) => `${outcome.caseId} (${outcome.surface})`),
    errors: outcomes.filter((outcome) => outcome.status === "error").length,
    identityOnly: outcomes.filter((outcome) => {
      const failing = outcome.checks.filter((check) => !check.passed && check.severity === "fail");
      return failing.length > 0 && failing.every((check) => check.name === "model identity");
    }).length,
    costUsd: costed.reduce((sum, outcome) => sum + (outcome.costUsd ?? 0), 0),
    costedReplies: costed.length,
    latencies: outcomes.flatMap((outcome) => (outcome.latencyMs ? [outcome.latencyMs] : [])).sort((a, b) => a - b),
    scores:
      judged.length > 0
        ? {
            relevance: mean((j) => j.relevance),
            accuracy: mean((j) => j.accuracy),
            helpfulness: mean((j) => j.helpfulness),
            tone: mean((j) => j.tone),
          }
        : undefined,
  };
}

const percentile = (sorted: number[], p: number) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))]!;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const passRate = (result: ModelResult) => (result.replies === 0 ? 0 : result.passed / result.replies);
const costPerReply = (result: ModelResult) => (result.costedReplies === 0 ? 0 : result.costUsd / result.costedReplies);

/**
 * Switch only if the challenger is at least as accurate as the incumbent
 * (within one reply) AND cheaper or clearly faster. Quality comes first: a
 * cheaper model that gets bookings or money wrong costs more than it saves.
 */
export function verdict(incumbent: ModelResult, challenger: ModelResult): string {
  const slack = 1 / Math.max(1, incumbent.replies);
  const asGood = passRate(challenger) + slack >= passRate(incumbent);
  const accurate = (challenger.scores?.accuracy ?? 0) + 0.1 >= (incumbent.scores?.accuracy ?? 0);
  const cheaper = costPerReply(challenger) < costPerReply(incumbent);
  const faster = percentile(challenger.latencies, 50) < percentile(incumbent.latencies, 50) * 0.8;
  if (asGood && accurate && (cheaper || faster)) {
    return `Switch to ${challenger.model}: as accurate as ${incumbent.model} on this suite, and ${[cheaper && "cheaper per reply", faster && "faster"].filter(Boolean).join(" and ")}.`;
  }
  if (!asGood || !accurate) {
    return `Keep ${incumbent.model}: ${challenger.model} passed fewer cases or scored lower on accuracy, and saving money is not worth wrong answers about bookings and payments.`;
  }
  return `Keep ${incumbent.model}: ${challenger.model} is no better on quality and neither cheaper nor faster.`;
}

function toMarkdown(results: ModelResult[]): string {
  const row = (label: string, cell: (result: ModelResult) => string) =>
    `| ${label} | ${results.map(cell).join(" | ")} |`;
  const lines = [
    "# Model comparison",
    "",
    `- **Date:** ${new Date().toISOString().slice(0, 10)}`,
    `- **Surfaces:** ${SURFACES}`,
    "",
    `| | ${results.map((result) => result.model).join(" | ")} |`,
    `|---|${results.map(() => "---").join("|")}|`,
    row("Served as", (r) => r.served.join(", ") || "n/a"),
    row("Passed", (r) => `${r.passed}/${r.replies} (${(passRate(r) * 100).toFixed(0)}%)`),
    row("Errors", (r) => String(r.errors)),
    row("Failed only on the model-id check", (r) => String(r.identityOnly)),
    row("Cost, agents only", (r) => `$${r.costUsd.toFixed(4)}`),
    row("Cost per reply", (r) => `$${costPerReply(r).toFixed(5)}`),
    row("Latency p50 / p90", (r) => `${seconds(percentile(r.latencies, 50))} / ${seconds(percentile(r.latencies, 90))}`),
    row("Judge R/A/H/T (of 5)", (r) =>
      r.scores
        ? [r.scores.relevance, r.scores.accuracy, r.scores.helpfulness, r.scores.tone].map((s) => s.toFixed(2)).join(" / ")
        : "n/a",
    ),
    "",
    "## Failed cases",
    "",
    ...results.flatMap((r) => [`**${r.model}**`, "", ...(r.failed.length ? r.failed.map((f) => `- ${f}`) : ["- none"]), ""]),
  ];
  if (results.length === 2) lines.push("## Verdict", "", verdict(results[0]!, results[1]!), "");
  return lines.join("\n");
}

async function main() {
  await checkKey();
  const models = argValue("models")?.split(",").map((model) => model.trim()).filter(Boolean) ?? DEFAULT_MODELS;
  const passThrough = process.argv.slice(2).filter((arg) => !arg.startsWith("--models="));
  const results: ModelResult[] = [];
  for (const model of models) results.push(await runModel(model, passThrough));
  const report = toMarkdown(results);
  await writeFile(`${reportsDir}compare.md`, report);
  console.log(`\n${report}\nReport: apps/evals/reports/compare.md`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
