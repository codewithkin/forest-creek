/**
 * Retrying a WhatsApp send. Free of whatsapp-web.js so it is unit tested.
 *
 * Photo sends fail now and then (an upload WhatsApp Web drops, a send while
 * the socket is reconnecting); staff saw "failed to send" on some photos while
 * others in the same reply arrived. A second or third try usually lands.
 */

/** Waits before the 2nd and 3rd attempt. */
export const SEND_RETRY_DELAYS_MS = [1_500, 4_000] as const;

export async function withRetries<T>(
  attempt: () => Promise<T>,
  delays: readonly number[] = SEND_RETRY_DELAYS_MS,
  onRetry?: (error: unknown, tryNumber: number) => void,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let index = 0; ; index++) {
    try {
      return await attempt();
    } catch (error) {
      if (index >= delays.length) throw error;
      onRetry?.(error, index + 2);
      await sleep(delays[index]!);
    }
  }
}

/** The id whatsapp-web.js gives a sent message (renamed to `$1` on newer WhatsApp Web builds). */
export function sentMessageId(message: unknown): string | undefined {
  const id = (message as { id?: { _serialized?: string; $1?: string } } | undefined)?.id;
  return id?._serialized ?? id?.$1;
}

/** WhatsApp's ack for a message it gave up on (the red "failed to send"). */
export const ACK_ERROR = -1;
