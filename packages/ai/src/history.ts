import type { ChatMessage } from "@forest-creek/db";

export type ConciergeMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Staff replies are replayed as assistant turns with a [Staff] marker. Without
 * it the agent reads Thembie's words as its own and starts speaking for the
 * lodge — promising things no one authorised.
 */
export function toConciergeMessages(history: ChatMessage[]): ConciergeMessage[] {
  return history.map((message) => {
    if (message.sender === "guest") {
      return { role: "user" as const, content: message.content };
    }
    if (message.sender === "admin") {
      return { role: "assistant" as const, content: "[Staff] " + message.content };
    }
    return { role: "assistant" as const, content: message.content };
  });
}
