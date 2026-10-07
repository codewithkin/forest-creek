import { promises as fs } from "node:fs";
import path from "node:path";

import {
  deleteWhatsappSession,
  getWhatsappSessionInfo,
  loadWhatsappSession,
  saveWhatsappSession,
  type WhatsappSessionInfo,
} from "@forest-creek/db";
import { describeError } from "@forest-creek/db/log";

/**
 * whatsapp-web.js's RemoteAuth store, backed by the shared Postgres database
 * (the whatsapp_session table, written through packages/db). LocalAuth kept
 * the pairing inside a Chromium profile on the container's disk, so every
 * redeploy threw it away and the lodge phone had to be scanned again. RemoteAuth
 * zips the parts of that profile that hold the pairing and hands them to this
 * store, which keeps them in the database and gives them back on the next boot.
 *
 * Adapted from WD_Logistics' agent (agent/src/lib/wa-session-store.ts).
 */

/** The database calls, injectable so the store is tested without Postgres. */
export type SessionDb = {
  save: (session: string, data: Uint8Array) => Promise<unknown>;
  load: (session: string) => Promise<Uint8Array | null>;
  info: (session: string) => Promise<WhatsappSessionInfo | null>;
  remove: (session: string) => Promise<boolean>;
};

const prismaDb: SessionDb = {
  save: saveWhatsappSession,
  load: loadWhatsappSession,
  info: getWhatsappSessionInfo,
  remove: deleteWhatsappSession,
};

function log(...args: unknown[]): void {
  console.log(`[whatsapp] ${new Date().toISOString()}`, ...args);
}

function logError(...args: unknown[]): void {
  console.error(`[whatsapp] ${new Date().toISOString()}`, ...args);
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export class DatabaseSessionStore {
  private readonly dataPath: string;

  /**
   * @param dataPath the same directory given to RemoteAuth as `dataPath`: the
   *   library writes `<dataPath>/<session>.zip` there and then calls save()
   *   with only the session name, so the store has to know where to look.
   */
  constructor(dataPath: string, private readonly db: SessionDb = prismaDb) {
    this.dataPath = path.resolve(dataPath);
  }

  archivePath(session: string): string {
    return path.join(this.dataPath, `${session}.zip`);
  }

  /**
   * False when the table cannot be read — on a fresh stack the agent can boot
   * before the server has run its migrations. A QR is the right answer then,
   * not a crash.
   */
  async sessionExists({ session }: { session: string }): Promise<boolean> {
    try {
      return (await this.db.info(session)) !== null;
    } catch (error) {
      logError("could not check for a stored session (has the server run its migrations?):", describeError(error));
      return false;
    }
  }

  /**
   * Stores the archive RemoteAuth has just written. NEVER throws: RemoteAuth
   * calls this from a bare setInterval, so a rejection would be an unhandled
   * one and take a healthy WhatsApp connection down with the process. A missed
   * backup only means the next cycle tries again.
   */
  async save({ session }: { session: string }): Promise<void> {
    try {
      const data = await fs.readFile(this.archivePath(session));
      await this.db.save(session, data);
      log(`session saved to the database (${mb(data.length)}) — it survives redeploys`);
    } catch (error) {
      logError(
        "session backup FAILED — WhatsApp is still connected, but a redeploy now would need a new scan; retrying next cycle:",
        describeError(error),
      );
    }
  }

  /** Writes the stored archive where RemoteAuth asks, for it to unzip into a fresh profile. */
  async extract({ session, path: target }: { session: string; path: string }): Promise<void> {
    const data = await this.db.load(session);
    if (!data) throw new Error(`No stored WhatsApp session named "${session}"`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    log(`session restored from the database (${mb(data.byteLength)})`);
  }

  /** Forgets the pairing. Never throws: a failed delete must not block a logout. */
  async delete({ session }: { session: string }): Promise<void> {
    try {
      if (await this.db.remove(session)) log("stored session deleted — the next connection will need a QR scan");
    } catch (error) {
      logError("could not delete the stored session:", describeError(error));
    }
  }

  /** For the status page: when the session was last saved, and how big it is. */
  async info(session: string): Promise<WhatsappSessionInfo | null> {
    try {
      return await this.db.info(session);
    } catch {
      return null;
    }
  }
}
