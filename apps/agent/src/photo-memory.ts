import { RESEND_WINDOW_MS, type RecentPhoto } from "@forest-creek/ai";

/**
 * Which photos each chat was actually sent lately, so send-photos can refuse
 * to repeat them unasked. In memory: after a restart the worst case is one
 * repeat, and nothing here needs to outlive the resend window.
 */
const sentByChat = new Map<string, RecentPhoto[]>();

export function recordPhotosSent(sessionId: string, paths: string[], now = Date.now()): void {
  const kept = recentPhotosFor(sessionId, now);
  sentByChat.set(sessionId, [...kept, ...paths.map((path) => ({ path, sentAt: now }))]);
}

export function recentPhotosFor(sessionId: string, now = Date.now()): RecentPhoto[] {
  return (sentByChat.get(sessionId) ?? []).filter((photo) => now - photo.sentAt < RESEND_WINDOW_MS);
}
