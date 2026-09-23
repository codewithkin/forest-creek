import { env } from "@forest-creek/env/server";
import { describeError } from "@forest-creek/db/log";
import QRCode from "qrcode";
import wweb from "whatsapp-web.js";

import { handleIncomingMessage } from "./reply";

// whatsapp-web.js is CommonJS; under ESM the named exports hang off default.
const { Client, LocalAuth } = wweb as unknown as {
  Client: new (options: Record<string, unknown>) => WhatsappClient;
  LocalAuth: new (options: { dataPath: string }) => unknown;
};

type WhatsappClient = {
  on: (event: string, listener: (...args: never[]) => void) => void;
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  sendMessage: (chatId: string, content: string) => Promise<unknown>;
  getContactLidAndPhone: (userIds: string[]) => Promise<{ lid?: string; pn?: string }[]>;
  info?: { wid?: { user?: string }; pushname?: string };
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
  number?: string;
  pushName?: string;
  lastError?: string;
  messagesHandled: number;
  startedAt: string;
};

const status: WhatsappStatus = {
  state: env.WHATSAPP_ENABLED ? "starting" : "disabled",
  messagesHandled: 0,
  startedAt: new Date().toISOString(),
};

let client: WhatsappClient | undefined;

export function getStatus(): WhatsappStatus {
  return { ...status };
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

export async function startWhatsapp(): Promise<void> {
  if (!env.WHATSAPP_ENABLED) {
    log("disabled by WHATSAPP_ENABLED=false");
    return;
  }

  log(`starting: session path=${env.WHATSAPP_SESSION_PATH} browser=${resolveBrowser() ?? "default"}`);

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: env.WHATSAPP_SESSION_PATH }),
    puppeteer: {
      headless: true,
      executablePath: resolveBrowser(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // Containers default to a 64MB /dev/shm, which Chromium outgrows.
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    },
  });

  client.on("loading_screen", (percent: never, message: never) => {
    log(`loading screen ${String(percent)}%${message ? ` — ${String(message)}` : ""}`);
  });

  client.on("change_state", (state: never) => {
    const s = String(state);
    log(`connection state → ${s}`);
    if (s === "CONNECTED") status.state = "ready";
    if (s === "DISCONNECTED") status.state = "disconnected";
  });

  client.on("qr", (qr: never) => {
    status.state = "qr";
    void QRCode.toDataURL(qr as unknown as string).then((dataUrl) => {
      status.qrDataUrl = dataUrl;
      log("pairing QR generated — scan it at GET /whatsapp/qr to link this device");
    });
  });

  client.on("authenticated", () => {
    status.state = "authenticated";
    status.qrDataUrl = undefined;
    log("authenticated — WhatsApp accepted this session");
  });

  client.on("ready", () => {
    status.state = "ready";
    status.qrDataUrl = undefined;
    status.number = client?.info?.wid?.user;
    status.pushName = client?.info?.pushname;
    log(
      `ready to receive messages as ${status.pushName ?? "unknown"} (${status.number ?? "?"}) — ` +
        `incoming messages now go through the booking agent`,
    );
  });

  client.on("auth_failure", (message: never) => {
    status.state = "failed";
    status.lastError = String(message);
    logError("auth failure:", message);
  });

  client.on("disconnected", (reason: never) => {
    status.state = "disconnected";
    status.lastError = String(reason);
    logError("disconnected:", reason);
  });

  client.on("battery", (payload: never) => {
    const { battery, plugged } = payload as unknown as { battery: number; plugged: boolean };
    log(`paired phone battery ${battery}%${plugged ? " (charging)" : ""}`);
  });

  client.on("message_create", (raw: never) => handleRawMessage(raw));

  // Delivery acks for our own replies — ack 1 = delivered, 2 = read.
  client.on("message_ack", (raw: never, ack: never) => {
    const message = raw as unknown as { fromMe?: boolean };
    const ackValue = ack as unknown as number;
    if (message.fromMe && ackValue > 0) {
      log(`our message acked (ack=${ackValue}: 1=delivered, 2=read)`);
    }
  });

  try {
    await client.initialize();
    log("initialize() resolved — waiting for 'ready'");
  } catch (error) {
    status.state = "failed";
    status.lastError = error instanceof Error ? error.message : String(error);
    logError("initialize failed:", describeError(error));
  }
}

export async function stopWhatsapp(): Promise<void> {
  log("stopping");
  await client?.destroy().catch((error) => logError("destroy failed:", describeError(error)));
  client = undefined;
}

/** Used by the staff reply endpoint, so a human can answer from the dashboard. */
export async function sendToGuest(chatId: string, content: string): Promise<void> {
  if (!client || status.state !== "ready") {
    throw new Error(`WhatsApp is not connected (state: ${status.state})`);
  }
  log(`staff reply → ${chatId}: ${JSON.stringify(content.slice(0, 80))}`);
  await client.sendMessage(chatId, content);
}