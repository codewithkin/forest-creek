import { env } from "@forest-creek/env/server";
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
    console.log("[whatsapp] disabled by WHATSAPP_ENABLED=false");
    return;
  }

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

  client.on("qr", (qr: never) => {
    status.state = "qr";
    void QRCode.toDataURL(qr as unknown as string).then((dataUrl) => {
      status.qrDataUrl = dataUrl;
      console.log("[whatsapp] scan the QR at GET /whatsapp/qr to pair this device");
    });
  });

  client.on("authenticated", () => {
    status.state = "authenticated";
    status.qrDataUrl = undefined;
  });

  client.on("ready", () => {
    status.state = "ready";
    status.qrDataUrl = undefined;
    status.number = client?.info?.wid?.user;
    status.pushName = client?.info?.pushname;
    console.log(`[whatsapp] ready as ${status.pushName ?? "unknown"} (${status.number ?? "?"})`);
  });

  client.on("auth_failure", (message: never) => {
    status.state = "failed";
    status.lastError = String(message);
    console.error("[whatsapp] auth failure", message);
  });

  client.on("disconnected", (reason: never) => {
    status.state = "disconnected";
    status.lastError = String(reason);
    console.warn("[whatsapp] disconnected", reason);
  });

  client.on("message", (raw: never) => {
    const message = raw as unknown as { from: string; body: string; fromMe?: boolean };
    if (message.fromMe) return;

    void handleIncomingMessage({ chatId: message.from, body: message.body })
      .then(async (result) => {
        if (!result.handled) return;
        status.messagesHandled++;
        await client?.sendMessage(message.from, result.reply);
      })
      .catch((error) => {
        console.error("[whatsapp] failed to handle message", error);
      });
  });

  try {
    await client.initialize();
  } catch (error) {
    status.state = "failed";
    status.lastError = error instanceof Error ? error.message : String(error);
    console.error("[whatsapp] initialize failed", error);
  }
}

export async function stopWhatsapp(): Promise<void> {
  await client?.destroy().catch(() => undefined);
  client = undefined;
}

/** Used by the staff reply endpoint, so a human can answer from the dashboard. */
export async function sendToGuest(phoneDigits: string, content: string): Promise<void> {
  if (!client || status.state !== "ready") {
    throw new Error(`WhatsApp is not connected (state: ${status.state})`);
  }
  await client.sendMessage(`${phoneDigits}@c.us`, content);
}
