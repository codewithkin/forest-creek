/**
 * Hands a staff reply to the WhatsApp agent, which owns the WhatsApp
 * connection. Without this, a reply typed in the dashboard was saved to the
 * thread and never reached the guest's phone — only the agent's own answers
 * did. Config is passed in, so this is tested without env or network.
 */

export type AgentConfig = {
  /** The agent's base URL — on Coolify the internal one, e.g. http://<agent-app>:3002. */
  url?: string;
  /** Shared with the agent; it refuses /whatsapp/send without it. */
  apiKey?: string;
};

export class AgentDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_CONFIGURED" | "UNREACHABLE" | "REFUSED",
  ) {
    super(message);
    this.name = "AgentDeliveryError";
  }
}

export function isWhatsappSession(sessionId: string): boolean {
  return sessionId.startsWith("whatsapp:");
}

export async function deliverWhatsappReply(
  input: { sessionId: string; content: string },
  config: AgentConfig,
  doFetch: typeof fetch = fetch,
): Promise<void> {
  if (!config.url || !config.apiKey) {
    throw new AgentDeliveryError(
      "WhatsApp replies are not set up: set AGENT_URL and AGENT_API_KEY on the API server (and the same AGENT_API_KEY on the agent).",
      "NOT_CONFIGURED",
    );
  }

  let response: Response;
  try {
    response = await doFetch(new URL("/whatsapp/send", config.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AgentDeliveryError(
      "Couldn't reach the WhatsApp agent, so the reply was not sent. Check the agent is running, then try again.",
      "UNREACHABLE",
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    const reason =
      response.status === 401
        ? "the agent did not accept the API key (AGENT_API_KEY must match on both)"
        : (body?.error ?? `the agent answered ${response.status}`);
    throw new AgentDeliveryError(`The reply was not sent to WhatsApp: ${reason}.`, "REFUSED");
  }
}
