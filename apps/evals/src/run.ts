import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  conciergeModel,
  extractReferences,
  isConciergeConfigured,
  todayInHarare,
} from "@forest-creek/ai";
import { getAvailableRooms, getPropertyBySlug, prisma } from "@forest-creek/db";

import { cases, type EvalCase, type Sector, type SurfaceName } from "./cases";
import {
  checkInventedLodging,
  checkLatency,
  checkMentionsAllProperties,
  checkModelIdentity,
  checkMustMention,
  checkMustNotMention,
  checkNoPromptLeak,
  checkNoStaffImpersonation,
  checkPaymentDetails,
  checkPrices,
  checkReferencesExist,
  checkReplyReceived,
  checkToolsCalled,
  checkWhatsappFormatting,
  expectedServedModel,
  type CheckResult,
  type GroundTruth,
} from "./checks";
import { calibrateJudge } from "./calibration";
import { loadGroundTruth } from "./ground-truth";
import { judgementPasses, judgeModelId, judgeReply, type Judgement } from "./judge";
import { SESSION_PREFIX, surfaces, type SurfaceReply } from "./surfaces";

type Options = {
  caseIds?: string[];
  surfaceNames?: SurfaceName[];
  sectors?: Sector[];
  concurrency: number;
  judge: boolean;
  latencyBudgetMs: number;
  /** "auto" grades known replies before trusting the judge on real ones. */
  calibrate: "auto" | "only" | "skip";
  /** How many times each known reply is graded; agreement must be unanimous. */
  calibrationRuns: number;
};

type Outcome = {
  caseId: string;
  sector: Sector;
  surface: SurfaceName;
  where: string;
  status: "pass" | "fail" | "error" | "skipped";
  turns: string[];
  reply?: string;
  latencyMs?: number;
  modelId?: string;
  provider?: string;
  toolsCalled?: string[];
  costUsd?: number;
  checks: CheckResult[];
  judgement?: Judgement;
  judgeModel?: string;
  error?: string;
};

function parseOptions(argv: string[]): Options {
  const value = (flag: string) =>
    argv.find((arg) => arg.startsWith(`--${flag}=`))?.slice(flag.length + 3);
  const list = (flag: string) => value(flag)?.split(",").map((item) => item.trim()).filter(Boolean);

  return {
    caseIds: list("case"),
    surfaceNames: list("surface") as SurfaceName[] | undefined,
    sectors: list("sector") as Sector[] | undefined,
    concurrency: Number(value("concurrency") ?? 3),
    judge: !argv.includes("--no-judge"),
    latencyBudgetMs: Number(value("latency-budget") ?? 30_000),
    calibrate: argv.includes("--calibrate-only")
      ? "only"
      : argv.includes("--skip-calibration")
        ? "skip"
        : "auto",
    calibrationRuns: Number(value("calibration-runs") ?? 1),
  };
}

const createdPhones: string[] = [];

function randomGuestPhone(): string {
  // "+26370" plus seven digits: a real-looking Zimbabwean mobile no guest owns.
  const phone = "+26370" + String(Math.floor(1_000_000 + Math.random() * 8_999_999));
  createdPhones.push(phone);
  return phone;
}

async function existingReferences(text: string): Promise<Set<string>> {
  const quoted = extractReferences(text);
  if (quoted.length === 0) return new Set();
  const rows = await prisma.booking.findMany({
    where: { reference: { in: quoted } },
    select: { reference: true },
  });
  return new Set(rows.map((row) => row.reference));
}

/** The bookings calendar for a case's dates, so the judge can verify availability claims. */
async function availabilityFacts(query: NonNullable<EvalCase["checkAvailability"]>) {
  const property = await getPropertyBySlug(query.propertySlug);
  if (!property) return undefined;
  const free = await getAvailableRooms(query.checkIn, query.checkOut, property.id);
  return {
    property: property.name,
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    availableRooms: free.map((room) => room.name),
  };
}

async function runOne(
  evalCase: EvalCase,
  surfaceName: SurfaceName,
  truth: GroundTruth,
  options: Options,
  today: string,
): Promise<Outcome> {
  const surface = surfaces[surfaceName];
  const runId = `${evalCase.id}-${surfaceName}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `eval-${runId}@example.com`;
  // Write cases run on several surfaces at once; a year per surface keeps their
  // bookings from colliding over the same room and nights.
  const year = String(2040 + evalCase.surfaces.indexOf(surfaceName));
  const fill = (text: string) => text.replaceAll("{email}", email).replaceAll("{year}", year);
  const turns = evalCase.turns.map(fill);
  // Read before the conversation: otherwise a booking the agent makes would make
  // the room it just booked look unavailable to the judge.
  const availability = evalCase.checkAvailability
    ? await availabilityFacts({
        propertySlug: evalCase.checkAvailability.propertySlug,
        checkIn: fill(evalCase.checkAvailability.checkIn),
        checkOut: fill(evalCase.checkAvailability.checkOut),
      })
    : undefined;
  const base = {
    caseId: evalCase.id,
    sector: evalCase.sector,
    surface: surfaceName,
    where: surface.where,
    turns,
  };

  let reply: SurfaceReply;
  try {
    reply = await surface.converse(turns, { runId, guestPhone: randomGuestPhone() });
  } catch (error) {
    return {
      ...base,
      status: "error",
      checks: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const checks: CheckResult[] = [
    checkReplyReceived(reply.text),
    checkLatency(reply.latencyMs, options.latencyBudgetMs),
    checkInventedLodging(reply.text, truth, evalCase.allowNames),
    checkPrices(reply.text, truth),
    checkReferencesExist(reply.text, await existingReferences(reply.text), turns),
    checkPaymentDetails(reply.text, truth),
    checkNoPromptLeak(reply.text),
    checkNoStaffImpersonation(reply.text),
  ];

  // Identity and tool use are only checked where the surface can see the run;
  // the public chat API deliberately does not expose either.
  if (reply.run) {
    checks.push(checkModelIdentity(reply.run.modelId, conciergeModel));
    if (evalCase.expectTools) {
      checks.push(checkToolsCalled(reply.run.toolsCalled, evalCase.expectTools));
    }
  }
  if (evalCase.mustMention) checks.push(checkMustMention(reply.text, evalCase.mustMention));
  if (evalCase.mustNotMention) {
    checks.push(checkMustNotMention(reply.text, evalCase.mustNotMention));
  }
  if (evalCase.mentionsAllProperties) checks.push(checkMentionsAllProperties(reply.text, truth));
  if (surfaceName === "whatsapp") checks.push(checkWhatsappFormatting(reply.text));

  // Read back for the judge: without it, a real reference the tools created
  // looks invented, because the judge never sees tool results.
  let createdBooking: { reference: string; totalAmountUsd: number } | undefined;
  if (evalCase.expectBooking) {
    const booking = await prisma.booking.findFirst({ where: { guestEmail: email } });
    if (booking) {
      createdBooking = { reference: booking.reference, totalAmountUsd: booking.totalAmount };
    }
    checks.push(
      booking
        ? { name: "booking persisted", passed: true, severity: "fail" }
        : {
            name: "booking persisted",
            passed: false,
            severity: "fail",
            detail: `no booking in the database for ${email}`,
          },
    );
    if (booking) {
      checks.push({
        name: "booking channel",
        passed: booking.channel === "whatsapp",
        severity: "fail",
        detail: booking.channel === "whatsapp" ? undefined : `stored as ${booking.channel}`,
      });
    }
  }

  let judgement: Judgement | undefined;
  let judgeModel: string | undefined;
  if (options.judge) {
    try {
      const judged = await judgeReply({
        evalCase,
        turns,
        surface: surfaceName,
        reply: reply.text,
        truth,
        today,
        availability,
        createdBooking,
      });
      judgement = judged.judgement;
      judgeModel = judged.judgeModel;
      if (judged.inconsistent) {
        // Contradictory scores say nothing about the reply: report the judge,
        // never count it against the agent.
        checks.push({
          name: "judge",
          passed: false,
          severity: "warn",
          detail: "the judge's scores contradicted its own verdict on both attempts",
        });
      } else {
        const passed = judgementPasses(judgement);
        checks.push({
          name: "judge: relevance, accuracy, rubric",
          passed,
          severity: "fail",
          detail: passed ? undefined : judgement.verdict,
        });
      }
    } catch (error) {
      checks.push({
        name: "judge",
        passed: false,
        severity: "warn",
        detail: `judge unavailable: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const failed = checks.some((check) => !check.passed && check.severity === "fail");
  return {
    ...base,
    status: failed ? "fail" : "pass",
    reply: reply.text,
    latencyMs: reply.latencyMs,
    modelId: reply.run?.modelId,
    provider: reply.run?.provider,
    toolsCalled: reply.run?.toolsCalled,
    costUsd: reply.run?.costUsd,
    checks,
    judgement,
    judgeModel,
  };
}

async function inPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]!();
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
  return results;
}

async function cleanup(): Promise<void> {
  const whatsappSessions = createdPhones.map((phone) => "whatsapp:" + phone.replace("+", ""));
  await prisma.chatMessage.deleteMany({
    where: {
      OR: [
        { sessionId: { startsWith: SESSION_PREFIX.router } },
        { sessionId: { startsWith: SESSION_PREFIX.http } },
        { sessionId: { in: whatsappSessions } },
      ],
    },
  });
  await prisma.booking.deleteMany({
    where: {
      OR: [
        { guestEmail: { startsWith: "eval-" } },
        { guestPhone: { in: createdPhones } },
      ],
    },
  });
}

function scoreLine(judgement: Judgement | undefined): string {
  if (!judgement) return "-";
  return `R${judgement.relevance} A${judgement.accuracy} H${judgement.helpfulness} T${judgement.tone}`;
}

function toMarkdown(outcomes: Outcome[], header: Record<string, string>): string {
  const lines: string[] = ["# AI eval report", ""];
  for (const [key, value] of Object.entries(header)) lines.push(`- **${key}:** ${value}`);
  lines.push("");

  const surfacesSeen = [...new Set(outcomes.map((outcome) => outcome.surface))];
  lines.push("## By surface", "", "| Surface | Where | Passed | Failed | Errors |", "|---|---|---|---|---|");
  for (const name of surfacesSeen) {
    const rows = outcomes.filter((outcome) => outcome.surface === name);
    lines.push(
      `| ${name} | ${rows[0]!.where} | ${rows.filter((r) => r.status === "pass").length} | ${rows.filter((r) => r.status === "fail").length} | ${rows.filter((r) => r.status === "error").length} |`,
    );
  }

  lines.push("", "## Results", "", "| Case | Surface | Status | Model | Provider | Tools | Latency | Judge |", "|---|---|---|---|---|---|---|---|");
  for (const outcome of outcomes) {
    lines.push(
      `| ${outcome.caseId} | ${outcome.surface} | ${outcome.status.toUpperCase()} | ${outcome.modelId ?? "n/a"} | ${outcome.provider ?? "n/a"} | ${outcome.toolsCalled?.join(", ") || (outcome.toolsCalled ? "none" : "n/a")} | ${outcome.latencyMs ? (outcome.latencyMs / 1000).toFixed(1) + "s" : "-"} | ${scoreLine(outcome.judgement)} |`,
    );
  }

  const problems = outcomes.filter((outcome) => outcome.status !== "pass");
  if (problems.length > 0) {
    lines.push("", "## Failures");
    for (const outcome of problems) {
      lines.push("", `### ${outcome.caseId} · ${outcome.surface} — ${outcome.status.toUpperCase()}`);
      if (outcome.error) lines.push("", `Error: ${outcome.error}`);
      for (const check of outcome.checks.filter((c) => !c.passed)) {
        lines.push(`- ${check.severity === "fail" ? "FAIL" : "warn"} **${check.name}** — ${check.detail ?? ""}`);
      }
      if (outcome.judgement?.problems.length) {
        lines.push(...outcome.judgement.problems.map((problem) => `- judge: ${problem}`));
      }
      if (outcome.reply) lines.push("", "Guest: " + outcome.turns.at(-1), "", "Reply:", "", "> " + outcome.reply.replace(/\n/g, "\n> "));
    }
  }

  return lines.join("\n") + "\n";
}

async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2));

  if (!isConciergeConfigured()) {
    console.error("OPENROUTER_API_KEY is not set in apps/server/.env — nothing to evaluate.");
    return 2;
  }

  const today = todayInHarare();
  const truth = await loadGroundTruth();

  const selected = cases.filter(
    (evalCase) =>
      (!options.caseIds || options.caseIds.includes(evalCase.id)) &&
      (!options.sectors || options.sectors.includes(evalCase.sector)),
  );

  const availability = new Map<SurfaceName, boolean>();
  for (const name of Object.keys(surfaces) as SurfaceName[]) {
    availability.set(name, await surfaces[name].available());
  }

  const header = {
    "Configured model": `${conciergeModel} (expected to be served as ${expectedServedModel(conciergeModel)})`,
    "Judge model": options.judge ? judgeModelId() : "disabled (--no-judge)",
    Date: today,
    Properties: truth.properties.map((property) => property.name).join(", "),
  };
  for (const [key, value] of Object.entries(header)) console.log(`${key}: ${value}`);
  console.log("");

  if (options.judge && options.calibrate !== "skip") {
    console.log(
      "Calibrating the judge against replies with known grades (" +
        options.calibrationRuns +
        (options.calibrationRuns === 1 ? " run" : " runs") +
        " each)...",
    );
    const calibration = await calibrateJudge(truth, today, options.calibrationRuns);
    for (const result of calibration) {
      const agreed = result.runs.filter(
        (run) => run.passed === result.expectPass && !run.inconsistent,
      ).length;
      console.log(
        "  " +
          (result.agrees ? "ok        " : "MISJUDGED ") +
          result.label +
          " (expected " +
          (result.expectPass ? "pass" : "fail") +
          ", agreed " +
          agreed +
          "/" +
          result.runs.length +
          "; " +
          result.runs
            .map((run) => "R" + run.relevance + " A" + run.accuracy + (run.inconsistent ? " contradictory" : ""))
            .join(", ") +
          ")",
      );
      for (const run of result.runs) {
        if (run.inconsistent || run.passed !== result.expectPass) {
          console.log("    judge said: " + run.verdict);
        }
      }
    }
    console.log("");
    if (calibration.some((result) => !result.agrees)) {
      console.error(
        "The judge disagrees with replies of known grade, so its scores cannot be trusted. Stopping.",
      );
      return 3;
    }
    if (options.calibrate === "only") return 0;
  }

  const skipped: Outcome[] = [];
  const tasks: (() => Promise<Outcome>)[] = [];

  for (const evalCase of selected) {
    for (const surfaceName of evalCase.surfaces) {
      if (options.surfaceNames && !options.surfaceNames.includes(surfaceName)) continue;
      const base = {
        caseId: evalCase.id,
        sector: evalCase.sector,
        surface: surfaceName,
        where: surfaces[surfaceName].where,
        turns: evalCase.turns,
        checks: [],
      };
      if (!availability.get(surfaceName)) {
        skipped.push({ ...base, status: "skipped", error: "surface not reachable" });
        continue;
      }
      tasks.push(async () => {
        const outcome = await runOne(evalCase, surfaceName, truth, options, today);
        const failures = outcome.checks
          .filter((check) => !check.passed && check.severity === "fail")
          .map((check) => check.name);
        console.log(
          `${outcome.status.toUpperCase().padEnd(5)} ${outcome.caseId.padEnd(26)} ${surfaceName.padEnd(17)} ${outcome.latencyMs ? (outcome.latencyMs / 1000).toFixed(1).padStart(5) + "s" : "     -"}  ${scoreLine(outcome.judgement).padEnd(11)} ${outcome.error ?? failures.join("; ")}`,
        );
        return outcome;
      });
    }
  }

  let outcomes: Outcome[] = [];
  try {
    outcomes = [...(await inPool(tasks, options.concurrency)), ...skipped];
  } finally {
    await cleanup();
  }

  const totals = {
    pass: outcomes.filter((outcome) => outcome.status === "pass").length,
    fail: outcomes.filter((outcome) => outcome.status === "fail").length,
    error: outcomes.filter((outcome) => outcome.status === "error").length,
    skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
  };
  const servedModels = [...new Set(outcomes.map((outcome) => outcome.modelId).filter(Boolean))];
  const providers = [...new Set(outcomes.map((outcome) => outcome.provider).filter(Boolean))];
  const cost = outcomes.reduce((sum, outcome) => sum + (outcome.costUsd ?? 0), 0);

  const summary = {
    ...header,
    "Served models observed": servedModels.join(", ") || "none observed",
    "Upstream providers observed": providers.join(", ") || "none observed",
    "Model cost (agents only)": `$${cost.toFixed(4)}`,
    Result: `${totals.pass} passed, ${totals.fail} failed, ${totals.error} errors, ${totals.skipped} skipped`,
  };

  const reportsDir = fileURLToPath(new URL("../reports/", import.meta.url));
  await mkdir(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(`${reportsDir}${stamp}.json`, JSON.stringify({ summary, outcomes }, null, 2));
  await writeFile(`${reportsDir}latest.md`, toMarkdown(outcomes, summary));

  console.log("");
  for (const [key, value] of Object.entries(summary)) console.log(`${key}: ${value}`);
  console.log(`Report: apps/evals/reports/latest.md`);

  return totals.fail + totals.error > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
