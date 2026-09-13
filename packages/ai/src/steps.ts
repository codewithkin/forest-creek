/**
 * Import-free, so it can be unit tested without the validated environment.
 */

/**
 * Forces a tool call on the first step of every turn; later steps are free.
 *
 * With only a prompt rule, DeepSeek sometimes skipped the tools entirely and
 * answered room and property questions from memory in three seconds, inventing
 * names. Every question these assistants field — even "hello" — is better
 * answered from real data, so a turn that starts without a tool is never right.
 */
export function groundFirstStep({ stepNumber }: { stepNumber: number }) {
  return stepNumber === 0 ? { toolChoice: "required" as const } : undefined;
}
