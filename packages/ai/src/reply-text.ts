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
