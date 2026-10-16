/**
 * Import-free, so it can be unit tested without the validated environment.
 */

/**
 * When to reach for each tool, in the guest's terms. The prompts print the
 * lines for exactly the tools an agent is given (see toolGuide), so an agent
 * is never told about a tool it lacks, and a new tool without a line here
 * fails at startup instead of being left for the model to guess at.
 */
export const TOOL_GUIDE: Record<string, string> = {
  "list-properties": "the guest hasn't said which property, or asks what places there are — gives the slug every other tool needs",
  "list-rooms": "rooms, nightly rates, beds, how many a room sleeps, which room suits a family",
  "list-activities": "experiences that can be added to a stay, and what each costs",
  "list-day-visits": "coming for the day without staying the night",
  "check-availability": "any question about dates — before you ever say a room is available, and again right before create-booking",
  "look-up-booking": "the guest gives an FC- reference and asks about that stay",
  "list-my-bookings": "\"my booking\" without a reference, a lost reference, or which stays this guest has",
  "get-payment-details": "how much is owed or due now, whether a deposit or payment arrived, when the balance is due, receipts",
  "quote-cancellation": "what cancelling or not turning up would cost, and what would be refunded",
  "quote-date-change": "moving, shortening or extending a stay — whether the policy allows it, availability and the new price",
  "change-payment-method": "the guest wants to pay by a different method than they booked with, e.g. card or InnBucks instead of EcoCash",
  "create-booking": "reserving a room once you have every detail — two calls, the second only after the guest confirms the read-back",
  "request-payment": "sending the EcoCash/OneMoney charge to the number the guest gave — the deposit, the balance, or the whole stay",
  "check-payment-status": "after a charge was sent: whether it has gone through",
  "send-photos": "only when the guest's latest message asks to see a property or a room — never for a greeting, a thank-you or a note meant for staff",
};

/** The "your tools" section of a prompt, for exactly the tools an agent has. */
export function toolGuide(toolIds: readonly string[]): string {
  const missing = toolIds.filter((id) => !TOOL_GUIDE[id]);
  if (missing.length > 0) throw new Error(`No TOOL_GUIDE line for: ${missing.join(", ")}`);
  return [
    "Your tools — pick by what the guest wants (call several when a question needs it, and follow any howToReply a tool returns):",
    ...toolIds.map((id) => `- ${id}: ${TOOL_GUIDE[id]}`),
  ].join("\n");
}
