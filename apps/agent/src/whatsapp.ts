import { env } from "@forest-creek/env/server";
import { describeError } from "@forest-creek/db/log";
import QRCode from "qrcode";
import wweb from "whatsapp-web.js";

import { handleIncomingMessage } from "./reply";
import { DatabaseSessionStore } from "./session-store";

// whatsapp-web.js is CommonJS; under ESM the named exports hang off default.
const { Client, RemoteAuth } = wweb as unknown as {
  Client: new (options: Record<string, unknown>) => WhatsappClient;
  RemoteAuth: new (options: {
    clientId: string;
    dataPath: string;
    store: DatabaseSessionStore;
    backupSyncIntervalMs: number;
  }) => unknown;
};

type WhatsappClient = {
  on: (event: string, listener: (...args: never[]) => void) => void;
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  logout: () => Promise<void>;
  sendMessage: (chatId: string, content: string) => Promise<unknown>;
  getContactLidAndPhone: (userIds: string[]) => Promise<{ lid?: string; pn?: string }[]>;
  requestPairingCode: (phoneNumber: string, showNotification?: boolean) => Promise<string>;
  info?: { wid?: { user?: string }; pushname?: string };
  authStrategy?: { storeRemoteSession?: () => Promise<void> };
};

export type ConnectionState =
  | "disabled"
  | "starting"
  | "qr"
  | "authenticated"
  | "ready"
  | "disconnected"
  | "failed";

export type WhatsappStatus = {
  state: ConnectionState;
  /** Data-URL PNG of the pairing QR, present only while state is "qr". */
  qrDataUrl?: string;
  /** When the current QR was issued. */
  qrUpdatedAt?: string;
  /**
   * When WhatsApp stops accepting it. A batch of codes comes ~20s apart (the
   * first lasts ~60s), then WhatsApp pauses for a minute or more — and a code
   * left on screen through that pause can only fail ("Couldn't link device").
   */
  qrExpiresAt?: string;
  /** An 8-character code for "Link with phone number instead", once requested. */
  pairingCode?: { code: string; phone: string; requestedAt: string };
  number?: string;
  pushName?: string;
  lastError?: string;
  messagesHandled: number;
  startedAt: string;
};

/**
 * One session name for good, so every container finds what the last one saved.
 * RemoteAuth names the stored archive `RemoteAuth-<clientId>`.
 */
const CLIENT_ID = "forest-creek";
export const SESSION_NAME = `RemoteAuth-${CLIENT_ID}`;

/** How often RemoteAuth copies the session to the database (its minimum is a minute). */
const BACKUP_EVERY_MS = 5 * 60_000;

/** A disconnected client that has not recovered by itself in this long is rebuilt. */
const RECOVER_AFTER_MS = 15_000;

/** How long a QR stays scannable: the first of a batch ~60s, the rest ~20s. */
const FIRST_QR_VALID_MS = 60_000;
const NEXT_QR_VALID_MS = 20_000;
/**
 * A QR this long after the previous one starts a new batch. Observed: a batch
 * is one ~60s code then ~20s codes; the second arrives 60s after the first,
 * and a new batch ~75s after the last one (20s of life plus a pause).
 */
const NEW_BATCH_AFTER_MS = 65_000;
/** No new QR for this long while waiting to be linked: WhatsApp has stalled, so reconnect. */
const QR_STALL_MS = 150_000;

/**
 * whatsapp-web.js presents itself as Chrome 101 on a 2018 Mac by default.
 * WhatsApp is quick to refuse linking a browser that looks that outdated
 * ("Couldn't link device"), so present a current desktop Chrome instead.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const status: WhatsappStatus = {
  state: env.WHATSAPP_ENABLED ? "starting" : "disabled",
  messagesHandled: 0,
  startedAt: new Date().toISOString(),
};

const store = new DatabaseSessionStore(env.WHATSAPP_SESSION_PATH);

let client: WhatsappClient | undefined;
/** Bumped for every client built, so events from a replaced client are ignored. */
let generation = 0;
let recoverTimer: ReturnType<typeof setTimeout> | undefined;
let qrStallTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * `bun run --hot` re-runs this module inside the same process. Without this,
 * every save in dev launched a second Chromium on the same profile — which
 * corrupts the pairing and is a classic cause of "Couldn't link device".
 * The running client is remembered here and shut down before a new one starts.
 */
const shared = globalThis as typeof globalThis & { __forestCreekWhatsapp?: WhatsappClient };

export function getStatus(): WhatsappStatus {
  return { ...status };
}

/** When the pairing was last saved to the database, for the QR page. */
export function getStoredSession() {
  return store.info(SESSION_NAME);
}

/** Every log is timestamped so Coolify shows the exact timeline of events. */
function log(...args: unknown[]): void {
  console.log(`[whatsapp] ${new Date().toISOString()}`, ...args);
}

function logError(...args: unknown[]): void {
  console.error(`[whatsapp] ${new Date().toISOString()}`, ...args);
}

/** Everything we know about a raw whatsapp-web.js message, flattened for logs. */
function describeMessage(raw: unknown): Record<string, unknown> {
  const m = raw as unknown as {
    id?: { id?: string };
    from?: string;
    to?: string;
    fromMe?: boolean;
    body?: string;
    type?: string;
    timestamp?: unknown;
    hasMedia?: boolean;
    author?: string;
    notifyName?: string;
    deviceType?: unknown;
    isGroup?: boolean;
    isStatus?: boolean;
    isNewMsg?: boolean;
  };
  return {
    id: m.id?.id,
    from: m.from,
    to: m.to,
    fromMe: m.fromMe ?? false,
    type: m.type ?? "?",
    timestamp: m.timestamp,
    body:
      typeof m.body === "string" && m.body.trim() ? m.body.slice(0, 160) : m.body ?? "",
    hasMedia: m.hasMedia ?? false,
    author: m.author,
    notifyName: m.notifyName,
    deviceType: m.deviceType,
    isGroup: m.isGroup,
    isStatus: m.isStatus,
    isNewMsg: m.isNewMsg,
  };
}

/**
 * A LID id's digits are NOT the guest's phone — the mapping is only known to
 * WhatsApp. Ask the connected device for the real number so the staff inbox and
 * bookings see an actual phone. Returns undefined when the contact is unknown.
 */
async function resolveLidPhone(chatId: string): Promise<string | undefined> {
  if (!chatId.endsWith("@lid") || !client) return undefined;
  try {
    const resolved = (await client.getContactLidAndPhone([chatId]))[0];
    const digits = resolved?.pn?.split("@")[0];
    if (digits && /^\d{6,20}$/.test(digits)) {
      log(`  → lid ${chatId} maps to phone +${digits}`);
      return `+${digits}`;
    }
    log(`  → lid ${chatId}: no phone mapping (contact unknown to this device)`);
  } catch (error) {
    logError(`  → lid ${chatId} phone lookup failed:`, error instanceof Error ? error.message : error);
  }
  return undefined;
}

/**
 * Single entry point for every message the connected device sees — whether it
 * came in, went out, or was delivered while the container was offline. Using
 * `message_create` (not `message`) because it also covers messages that the
 * `message` event can miss; own messages are filtered out by `fromMe`.
 */
function handleRawMessage(raw: never): void {
  const m = raw as unknown as {
    from?: string;
    body?: string;
    fromMe?: boolean;
    type?: string;
    getChat?: () => Promise<unknown>;
  };

  log("message_create:", describeMessage(raw));

  if (m.fromMe) {
    log("  → sent by us, ignoring");
    return;
  }

  const chatId = m.from ?? "";
  const body = m.body ?? "";
  log(`  → dispatching: chat=${chatId} type=${m.type ?? "?"} body=${JSON.stringify(body.slice(0, 80))}`);

  void (async () => {
    try {
      const phone = await resolveLidPhone(chatId);
      const result = await handleIncomingMessage({ chatId, body, phone });
      if (!result.handled) {
        log(`  → ignored by pipeline (${result.reason})`);
        return;
      }
      status.messagesHandled++;
      log(
        `  → reply generated for ${result.sessionId} (${result.reply.length} chars, degraded=${result.degraded}` +
          (result.groundingBlocked ? `, groundingBlocked=${result.groundingBlocked}` : "") +
          (result.run ? `, model=${result.run.modelId} latency=${result.run.latencyMs}ms` : "") +
          ")",
      );
      const sent = await client?.sendMessage(chatId, result.reply);
      log(`  → reply sent to ${chatId} (${sent ? "accepted by WhatsApp" : "no client"})`);
    } catch (error) {
      logError("failed to handle message:", describeError(error));
    }
  })();
}

function resolveBrowser(): string | undefined {
  if (env.PUPPETEER_EXECUTABLE_PATH) return env.PUPPETEER_EXECUTABLE_PATH;
  // Puppeteer's own download is disabled in this workspace, so fall back to a
  // system browser where one exists.
  for (const candidate of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ]) {
    try {
      if (Bun.file(candidate).size > 0) return candidate;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

function clearPairing(): void {
  clearTimeout(qrStallTimer);
  status.qrDataUrl = undefined;
  status.qrUpdatedAt = undefined;
  status.qrExpiresAt = undefined;
  status.pairingCode = undefined;
}

async function closeClient(target: WhatsappClient | undefined): Promise<void> {
  if (!target) return;
  await target.destroy().catch((error) => logError("closing the browser failed:", describeError(error)));
}

/** Takes the running client out of service, so its late events are ignored. */
function retire(): WhatsappClient | undefined {
  clearTimeout(recoverTimer);
  clearTimeout(qrStallTimer);
  const target = client ?? shared.__forestCreekWhatsapp;
  generation++;
  client = undefined;
  shared.__forestCreekWhatsapp = undefined;
  return target;
}

/** Rebuilds the client unless it has reached a QR or a connection by then. */
function scheduleRecovery(reason: string, delayMs = RECOVER_AFTER_MS): void {
  clearTimeout(recoverTimer);
  recoverTimer = setTimeout(() => {
    if (status.state === "qr" || status.state === "ready" || status.state === "authenticated") return;
    log(`still ${status.state} ${Math.round(delayMs / 1000)}s after ${reason} — starting a fresh connection`);
    void connect();
  }, delayMs);
}

/** Builds a client and connects it: from the stored session when there is one, else to a fresh QR. */
async function connect(): Promise<void> {
  await closeClient(retire());
  const mine = generation;
  const current = () => mine === generation;
  status.state = "starting";
  status.lastError = undefined;
  status.number = undefined;
  status.pushName = undefined;
  clearPairing();

  const stored = await store.sessionExists({ session: SESSION_NAME });
  if (!current()) return;
  log(
    `connecting (${stored ? "restoring the session saved in the database" : "no saved session — a QR will be shown"}); ` +
      `browser=${resolveBrowser() ?? "default"}`,
  );

  const next = new Client({
    authStrategy: new RemoteAuth({
      clientId: CLIENT_ID,
      dataPath: env.WHATSAPP_SESSION_PATH,
      store,
      backupSyncIntervalMs: BACKUP_EVERY_MS,
    }),
    // Always the live WhatsApp Web. The default caches one build on disk and
    // keeps serving it; once WhatsApp moves on, linking fails on the phone.
    webVersionCache: { type: "none" },
    userAgent: USER_AGENT,
    // What the phone lists under Linked devices.
    deviceName: "Forest Creek Agent",
    browserName: "Chrome",
    // The same session opened elsewhere (a rolling deploy's other container)
    // is a CONFLICT, which RemoteAuth answers by deleting the stored pairing.
    // Taking the session over keeps it.
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    puppeteer: {
      headless: true,
      executablePath: resolveBrowser(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // Containers default to a 64MB /dev/shm, which Chromium outgrows.
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
      ],
      // Small VPSes stall Chromium under load; a slow page is not a dead one.
      protocolTimeout: 300_000,
    },
  });
  client = next;
  shared.__forestCreekWhatsapp = next;

  // A stored session that WhatsApp answers with a QR has been revoked
  // (unlinked while the agent was down). Forget it once, so the new pairing is
  // saved within a minute instead of being shadowed by the dead one.
  let forgotRevoked = false;
  let lastQrAt = 0;

  next.on("loading_screen", (percent: never, message: never) => {
    if (!current()) return;
    log(`loading screen ${String(percent)}%${message ? ` — ${String(message)}` : ""}`);
  });

  next.on("change_state", (state: never) => {
    if (!current()) return;
    const s = String(state);
    log(`connection state → ${s}`);
    if (s === "CONNECTED") status.state = "ready";
  });

  next.on("qr", (qr: never) => {
    if (!current()) return;
    status.state = "qr";
    if (stored && !forgotRevoked) {
      forgotRevoked = true;
      log("the saved session was not accepted (unlinked on the phone?) — forgetting it");
      void store.delete({ session: SESSION_NAME });
    }
    const issuedAt = Date.now();
    const firstOfBatch = issuedAt - lastQrAt > NEW_BATCH_AFTER_MS;
    lastQrAt = issuedAt;
    clearTimeout(qrStallTimer);
    qrStallTimer = setTimeout(() => {
      if (!current() || status.state !== "qr") return;
      log(`no new QR from WhatsApp for ${QR_STALL_MS / 1000}s — reconnecting for a fresh one`);
      void connect();
    }, QR_STALL_MS);
    void QRCode.toDataURL(qr as unknown as string, { margin: 1, width: 360 }).then((dataUrl) => {
      if (!current()) return;
      status.qrDataUrl = dataUrl;
      status.qrUpdatedAt = new Date(issuedAt).toISOString();
      status.qrExpiresAt = new Date(issuedAt + (firstOfBatch ? FIRST_QR_VALID_MS : NEXT_QR_VALID_MS)).toISOString();
      log(`new pairing QR (valid ~${firstOfBatch ? 60 : 20}s) — scan it at /whatsapp/qr`);
    });
  });

  // Pairing codes are re-issued every few minutes while the phone has not entered one.
  next.on("code", (code: never) => {
    if (!current() || !status.pairingCode) return;
    status.pairingCode = { ...status.pairingCode, code: String(code), requestedAt: new Date().toISOString() };
    log(`pairing code renewed for +${status.pairingCode.phone}`);
  });

  next.on("authenticated", () => {
    if (!current()) return;
    status.state = "authenticated";
    clearPairing();
    log("authenticated — WhatsApp accepted this session");
  });

  next.on("ready", () => {
    if (!current()) return;
    status.state = "ready";
    status.lastError = undefined;
    clearPairing();
    status.number = next.info?.wid?.user;
    status.pushName = next.info?.pushname;
    log(
      `ready to receive messages as ${status.pushName ?? "unknown"} (${status.number ?? "?"}) — ` +
        `incoming messages now go through the booking agent`,
    );
  });

  next.on("remote_session_saved", () => {
    if (!current()) return;
    log("first save of the new pairing done — it now survives restarts and redeploys");
  });

  next.on("auth_failure", (message: never) => {
    if (!current()) return;
    status.state = "failed";
    status.lastError = `WhatsApp rejected the saved session: ${String(message)}`;
    logError("auth failure:", message);
    void store.delete({ session: SESSION_NAME }).then(() => scheduleRecovery("an auth failure", 3_000));
  });

  next.on("disconnected", (reason: never) => {
    if (!current()) return;
    const why = String(reason);
    status.state = "disconnected";
    status.number = undefined;
    status.pushName = undefined;
    clearPairing();
    if (/LOGOUT|UNPAIRED/i.test(why)) {
      // Logged out on the phone (Linked devices → Log out). RemoteAuth deletes
      // the stored copy itself; this makes sure of it, then a fresh QR follows.
      status.lastError = "This device was logged out from the phone. Scan the new QR to link it again.";
      log("logged out from the phone — forgetting the session and preparing a new QR");
      void store.delete({ session: SESSION_NAME });
    } else {
      status.lastError = `Disconnected: ${why}`;
    }
    logError("disconnected:", why);
    scheduleRecovery(`a disconnect (${why})`);
  });

  next.on("battery", (payload: never) => {
    if (!current()) return;
    const { battery, plugged } = payload as unknown as { battery: number; plugged: boolean };
    log(`paired phone battery ${battery}%${plugged ? " (charging)" : ""}`);
  });

  next.on("message_create", (raw: never) => {
    if (current()) handleRawMessage(raw);
  });

  // Delivery acks for our own replies — ack 1 = delivered, 2 = read.
  next.on("message_ack", (raw: never, ack: never) => {
    if (!current()) return;
    const message = raw as unknown as { fromMe?: boolean };
    const ackValue = ack as unknown as number;
    if (message.fromMe && ackValue > 0) {
      log(`our message acked (ack=${ackValue}: 1=delivered, 2=read)`);
    }
  });

  try {
    await next.initialize();
    if (current()) log("initialize() resolved — waiting for 'ready'");
  } catch (error) {
    if (!current()) return;
    status.state = "failed";
    status.lastError = error instanceof Error ? error.message : String(error);
    logError("initialize failed:", describeError(error));
    scheduleRecovery("a failed start", 30_000);
  }
}

export async function startWhatsapp(): Promise<void> {
  if (!env.WHATSAPP_ENABLED) {
    log("disabled by WHATSAPP_ENABLED=false");
    return;
  }
  await connect();
}

/**
 * Unlinks this device for good, as staff asked from the QR page: WhatsApp is
 * told (it disappears from the phone's Linked devices), the stored session is
 * deleted, and a fresh QR follows. The stored copy goes even when telling
 * WhatsApp fails — a dead pairing must never be restored on the next boot.
 */
export async function logoutWhatsapp(): Promise<{ toldWhatsApp: boolean }> {
  const target = retire();
  let toldWhatsApp = false;
  if (target) {
    try {
      await target.logout();
      toldWhatsApp = true;
    } catch (error) {
      logError("could not tell WhatsApp about the logout (removing the session anyway):", describeError(error));
    }
    await closeClient(target);
  }
  await store.delete({ session: SESSION_NAME });
  status.state = "starting";
  status.number = undefined;
  status.pushName = undefined;
  status.lastError = undefined;
  clearPairing();
  log(`logged out by staff${toldWhatsApp ? "" : " (WhatsApp was not reachable)"} — starting fresh for a new QR`);
  void connect();
  return { toldWhatsApp };
}

/** Closes and reopens the connection, keeping the saved session. */
export async function restartWhatsapp(): Promise<void> {
  log("restart requested by staff");
  void connect();
}

/**
 * "Link with phone number instead": an 8-character code the phone types in,
 * for phones that cannot scan the QR. Only while waiting to be linked.
 */
export async function requestPairingCode(phone: string): Promise<string> {
  const digits = phone.replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) {
    throw new Error("Enter the full number with its country code, e.g. 263771234567.");
  }
  if (!client || status.state !== "qr") {
    throw new Error("A code can only be requested while the agent is waiting to be linked.");
  }
  const code = await client.requestPairingCode(digits, true);
  status.pairingCode = { code, phone: digits, requestedAt: new Date().toISOString() };
  log(`pairing code issued for +${digits}`);
  return code;
}

/**
 * Shutdown (SIGTERM on a redeploy): save the session once more so the next
 * container gets the newest keys, then close the browser — never log out.
 */
export async function stopWhatsapp(): Promise<void> {
  log("stopping");
  const wasReady = status.state === "ready";
  const target = retire();
  if (target && wasReady) {
    const saved = target.authStrategy?.storeRemoteSession?.();
    if (saved) {
      await Promise.race([saved.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 8_000))]);
    }
  }
  await closeClient(target);
}

/** Used by the staff reply endpoint, so a human can answer from the dashboard. */
export async function sendToGuest(chatId: string, content: string): Promise<void> {
  if (!client || status.state !== "ready") {
    throw new Error(`WhatsApp is not connected (state: ${status.state})`);
  }
  log(`staff reply → ${chatId}: ${JSON.stringify(content.slice(0, 80))}`);
  await client.sendMessage(chatId, content);
}
