import { assistantCapabilities } from "@forest-creek/ai/brand";
import { Agent } from "@mastra/core/agent";
import type { ModelRouterModelId } from "@mastra/core/llm";
import { z } from "zod";

import type { EvalCase, SurfaceName } from "./cases";
import type { GroundTruth } from "./checks";

/**
 * A different vendor from the model under test, so the concierge is never
 * grading its own homework. Override with EVAL_JUDGE_MODEL.
 */
export const DEFAULT_JUDGE_MODEL = "openrouter/openai/gpt-5.4-mini";

function score(description: string) {
  return z.number().int().min(1).max(5).describe(description);
}

/**
 * Field order is deliberate. Structured output is generated top to bottom, so
 * the judge commits to its reasoning before it picks numbers — scores written
 * first drifted from the verdict written after them.
 */
export const judgementSchema = z.object({
  problems: z
    .array(z.string())
    .describe("First: specific problems, quoting the reply where possible. Empty if there are none."),
  verdict: z.string().describe("Second: one sentence on how good the reply is."),
  followsRubric: z.boolean().describe("Third: does the reply do what the rubric requires?"),
  relevance: score(
    "How directly and completely the reply answers what the guest asked. 1 = ignores or misreads the question; 3 = partly answers; 5 = fully answers.",
  ),
  accuracy: score(
    "Whether every fact is supported by the sanctioned facts or the inventory. 1 = states something invented (any made-up room, rate, property, experience, booking or bank detail); 3 = minor unsupported embellishment; 5 = everything is supported.",
  ),
  helpfulness: score(
    "Whether it moves the guest forward. 1 = a dead end; 3 = some next step; 5 = a clear next step, real options or a contact.",
  ),
  tone: score(
    "Voice only, not accuracy: warm, concise and on-brand for a small eco-lodge, at the right length for the channel. 1 = off-brand or rambling; 5 = exactly right.",
  ),
});

export type Judgement = z.infer<typeof judgementSchema>;

const JUDGE_INSTRUCTIONS = `
You are a strict quality reviewer for a small hotel group's AI concierge.

You are given two kinds of truth:
1. Sanctioned facts — the business description, hosts, contacts and the
   assistant's own capabilities. The assistant is told these and may state
   them freely. Repeating them is never an invention.
2. Inventory — the complete list of properties, rooms, rates and experiences
   from the database. Nothing else exists.

A reply is inaccurate when it states something neither kind of truth supports:
a room, rate, property, experience, booking reference or bank detail that is
not there. Be harsh about that — a warm, fluent reply describing a room that
does not exist is a failure, not a near miss. Reasonable paraphrase of a real
description is fine.

Work in this order: list the problems, write the verdict, decide whether the
rubric is met, and only then give scores that agree with what you wrote. Every
score runs from 1 (worst) to 5 (best). A reply you have called correct and
complete cannot score below 4 on relevance or accuracy; a reply containing an
invented fact cannot score above 1 on accuracy.

Score each dimension on its own. Do not let an accuracy problem drag down tone,
and do not reward length. Do not penalise a reply for declining something it
should decline. For the WhatsApp channel, visible Markdown syntax is a
formatting fault.
`.trim();

export function judgeModelId(): string {
  return process.env.EVAL_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
}

let judge: Agent | undefined;

function getJudge(): Agent {
  judge ??= new Agent({
    id: "eval-judge",
    name: "Eval judge",
    instructions: JUDGE_INSTRUCTIONS,
    model: judgeModelId() as ModelRouterModelId,
  });
  return judge;
}

export type JudgeInput = {
  evalCase: EvalCase;
  /** The guest turns as actually sent, placeholders filled in. */
  turns: string[];
  surface: SurfaceName;
  reply: string;
  truth: GroundTruth;
  today: string;
};

export type JudgeOutcome = {
  judgement: Judgement;
  judgeModel: string | undefined;
  /** True when the judge contradicted itself on both attempts. */
  inconsistent: boolean;
  attempts: number;
};

function buildPrompt(input: JudgeInput): string {
  const onWhatsapp = input.surface === "whatsapp" || input.surface === "booking-agent";
  const { brand, ...inventory } = input.truth;

  const sanctioned = {
    ...brand,
    channel: onWhatsapp ? "WhatsApp" : "website chat widget",
    whatThisAssistantCanDo: onWhatsapp
      ? assistantCapabilities.whatsapp
      : assistantCapabilities.website,
  };

  return [
    `Today: ${input.today}`,
    `Sanctioned facts:\n${JSON.stringify(sanctioned, null, 2)}`,
    `Inventory — the only properties, rooms and experiences that exist:\n${JSON.stringify(inventory, null, 2)}`,
    `Guest messages, in order:\n${input.turns.map((turn, index) => `${index + 1}. ${turn}`).join("\n")}`,
    `Final reply to grade:\n"""\n${input.reply}\n"""`,
    `Rubric — what a good reply does:\n${input.evalCase.rubric}`,
  ].join("\n\n");
}

async function askJudge(prompt: string): Promise<{ judgement: Judgement; judgeModel: string | undefined }> {
  const result = (await getJudge().generate([{ role: "user", content: prompt }], {
    structuredOutput: { schema: judgementSchema },
  })) as unknown as { object?: unknown; response?: { modelId?: string } };

  if (!result.object) throw new Error("the judge returned no structured judgement");
  return { judgement: judgementSchema.parse(result.object), judgeModel: result.response?.modelId };
}

/**
 * A judgement whose numbers contradict its own reasoning. Such a grade says
 * nothing about the reply, so it must never be counted as a pass or a fail.
 */
export function isInconsistent(judgement: Judgement): boolean {
  const metRubricButIrrelevant =
    judgement.followsRubric && judgement.accuracy >= 4 && judgement.relevance <= 2;
  const cleanButScoredLow =
    judgement.followsRubric &&
    judgement.problems.length === 0 &&
    (judgement.relevance < 4 || judgement.accuracy < 4);
  const failedWithoutReason = !judgement.followsRubric && judgement.problems.length === 0;
  return metRubricButIrrelevant || cleanButScoredLow || failedWithoutReason;
}

export async function judgeReply(input: JudgeInput): Promise<JudgeOutcome> {
  const prompt = buildPrompt(input);

  const first = await askJudge(prompt);
  if (!isInconsistent(first.judgement)) {
    return { ...first, inconsistent: false, attempts: 1 };
  }

  // One retry: contradictions are usually sampling noise, not a stable view.
  const second = await askJudge(prompt);
  return { ...second, inconsistent: isInconsistent(second.judgement), attempts: 2 };
}

/** Relevance and accuracy are what decide a pass; tone and helpfulness are reported. */
export function judgementPasses(judgement: Judgement): boolean {
  return judgement.relevance >= 4 && judgement.accuracy >= 4 && judgement.followsRubric;
}
