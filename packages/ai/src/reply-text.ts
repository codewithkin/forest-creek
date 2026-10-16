/**
 * Import-free, so it can be unit tested without loading the validated
 * environment that the agents themselves need.
 */

type RawStep = { text?: string; toolCalls?: unknown[] };
type RawRun = { text?: string; steps?: RawStep[] };

/**
 * The reply a guest may see: the text of the last step that called no tools.
 *
 * Mastra's result.text joins every step, and text written in a step that also
 * calls a tool is produced before that tool has returned. In one probe the
 * concierge, while its list-properties call was still in flight, wrote that
 * the group had "The Riverhouse" and "The Hillside Cabin" — neither exists. So
 * that text is never used, even as a fallback: an empty result makes callers
 * send a safe failure reply instead.
 */
export function finalReplyText(raw: unknown): string {
  const result = raw as RawRun;
  const steps = result.steps;
  if (!steps || steps.length === 0) return stripStaffMarker(result.text ?? "");

  for (let index = steps.length - 1; index >= 0; index--) {
    const step = steps[index];
    if (step?.toolCalls && step.toolCalls.length > 0) continue;
    const text = stripStaffMarker(step?.text ?? "");
    if (text) return text;
  }
  return "";
}

/**
 * History replays staff turns as "[Staff] ..." so the model can tell them from
 * its own. It once copied the marker onto its own reply, putting invented
 * policy in a staff member's mouth; the marker is never the model's to use.
 */
export function stripStaffMarker(text: string): string {
  return text.replace(/^(?:\s*\[staff\]:?)+/i, "").trim();
}

type ToolEntry = { toolName?: string; result?: unknown };

/** Every booking payment page a tool handed the model this turn. */
export function paymentPagesFrom(toolResults: unknown): string[] {
  if (!Array.isArray(toolResults)) return [];
  const pages = new Set<string>();
  for (const raw of toolResults as (ToolEntry & { payload?: ToolEntry })[]) {
    const result = (raw?.payload ?? raw)?.result as { paymentPageUrl?: unknown } | undefined;
    if (typeof result?.paymentPageUrl === "string") pages.add(result.paymentPageUrl);
  }
  return [...pages];
}

const POINTS_AT_PAYMENT_PAGE = /payment page|pay (?:on|here|online|there)|:\s*$/i;

/**
 * A reply that sends the guest to "the payment page:" must carry the link.
 * Live, the model ended a reply on "…pay on the booking's payment page:" and
 * nothing after it. The page comes from the tool result, never from the model.
 */
export function completePaymentLink(reply: string, pages: string[]): string {
  const page = pages[0];
  if (!page || pages.some((candidate) => reply.includes(candidate))) return reply;
  const text = reply.trimEnd();
  if (!POINTS_AT_PAYMENT_PAGE.test(text)) return reply;
  return text.endsWith(":") ? `${text} ${page}` : `${text}\n\nYou can pay here: ${page}`;
}
