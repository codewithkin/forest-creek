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
