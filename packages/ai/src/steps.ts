/**
 * Import-free, so it can be unit tested without the validated environment.
 */

/**
 * Forces a tool call on the first step of every turn, from the tools given;
 * later steps are free.
 *
 * With only a prompt rule, DeepSeek sometimes skipped the tools entirely and
 * answered room and property questions from memory in three seconds, inventing
 * names. Every question these assistants field — even "hello" — is better
 * answered from real data, so a turn that starts without a tool is never right.
 *
 * The caller picks which tools may open a turn. Never one with an unguarded
 * side effect: send-photos, offered here, was picked for "Hi" and sent the same
 * photos again. (create-booking once was a risk too; since ConfirmationGate its
 * first call only reads the stay back.)
 */
export function groundFirstStep({ stepNumber }: { stepNumber: number }, firstStepTools: string[]) {
  return stepNumber === 0
    ? { toolChoice: "required" as const, activeTools: firstStepTools }
    : undefined;
}

/**
 * Whether a run called any tool at all. Most upstreams ignore tool_choice
 * "required" — in a direct probe only one of six OpenRouter providers for
 * DeepSeek honoured it — so the runners check the outcome instead.
 */
export function calledAnyTool(raw: unknown): boolean {
  const result = raw as { toolCalls?: unknown[]; steps?: Array<{ toolCalls?: unknown[] }> };
  if (result.toolCalls && result.toolCalls.length > 0) return true;
  return (result.steps ?? []).some((step) => (step.toolCalls?.length ?? 0) > 0);
}

type ToolEntry = { toolName?: string; result?: unknown; payload?: { toolName?: string; result?: unknown } };

/** What each tool returned in a run, compactly — for a corrected retry to reason from. */
export function toolResultsDigest(toolResults: unknown, limit = 4_000): string {
  if (!Array.isArray(toolResults) || toolResults.length === 0) return "none";
  const entries = (toolResults as ToolEntry[]).map((raw) => {
    const entry = raw?.payload ?? raw;
    return { tool: entry?.toolName ?? "?", result: entry?.result };
  });
  const text = JSON.stringify(entries);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * Instructions for one more attempt at a reply the grounding guard blocked.
 * The model is told why, and what its tools already did this turn — their
 * effects stand — so it can call the tool it skipped or simply drop the claim,
 * instead of the guest getting a dead-end "the team will pick this up".
 */
export function correctionInstructions(reason: string, toolResults: unknown): string {
  return [
    "",
    "IMPORTANT — your previous reply to the guest's latest message was NOT sent. A safety check stopped it because:",
    reason,
    "Tools you already called for this message (their effects stand, do not repeat them unless the reason says a tool was missing):",
    toolResultsDigest(toolResults),
    "Write the reply again. If you meant to say something happened — a booking made, a charge or PIN prompt sent, a payment received — call the tool that does it and report only what it returned; otherwise leave that claim out. Never pass on raw error codes, hashes or long numbers from a tool; say plainly what it means for the guest.",
  ].join("\n");
}

/**
 * The tools a corrected retry may use: all of them, except request-payment
 * once the first attempt called it — a second call would push a second PIN
 * prompt to the guest's phone for a reply that was only badly worded.
 */
export function retryTools(allTools: readonly string[], toolsCalled: readonly string[]): string[] {
  const charged = toolsCalled.includes("request-payment");
  return allTools.filter((id) => !(charged && id === "request-payment"));
}

type AttemptSummary = {
  toolsCalled: string[];
  toolResults: unknown;
  usage: { inputTokens: number; outputTokens: number; costUsd: number | undefined };
};

/**
 * Both attempts answer one guest message, so what either one's tools did is
 * this turn's fact (a charge the first attempt sent may be reported by the
 * second). The words and photos are the retry's alone.
 */
export function mergeRetry<Run extends AttemptSummary, Photo>(first: Run, retried: Run, photos: Photo[]): Run & { photos: Photo[] } {
  const results = (run: Run) => (Array.isArray(run.toolResults) ? run.toolResults : []);
  const cost = (run: Run) => run.usage.costUsd;
  return {
    ...retried,
    toolsCalled: [...first.toolsCalled, ...retried.toolsCalled],
    toolResults: [...results(first), ...results(retried)],
    usage: {
      inputTokens: first.usage.inputTokens + retried.usage.inputTokens,
      outputTokens: first.usage.outputTokens + retried.usage.outputTokens,
      costUsd: cost(first) === undefined && cost(retried) === undefined ? undefined : (cost(first) ?? 0) + (cost(retried) ?? 0),
    },
    photos,
  };
}
