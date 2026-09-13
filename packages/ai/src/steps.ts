/**
 * Import-free, so it can be unit tested without the validated environment.
 */

/**
 * Forces a tool call on the first step of every turn, from the read-only tools
 * only; later steps are free.
 *
 * With only a prompt rule, DeepSeek sometimes skipped the tools entirely and
 * answered room and property questions from memory in three seconds, inventing
 * names. Every question these assistants field — even "hello" — is better
 * answered from real data, so a turn that starts without a tool is never right.
 *
 * The first call may only read: forcing "any tool" let the WhatsApp agent pick
 * create-booking while it was still collecting details, before the guest had
 * confirmed anything.
 */
export function groundFirstStep({ stepNumber }: { stepNumber: number }, readOnlyTools: string[]) {
  return stepNumber === 0
    ? { toolChoice: "required" as const, activeTools: readOnlyTools }
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
