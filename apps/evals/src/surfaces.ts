import {
  runBookingAgent,
  runConcierge,
  todayInHarare,
  type AgentRun,
  type ConciergeMessage,
} from "@forest-creek/ai";
import { t } from "@forest-creek/api";
import { appRouter } from "@forest-creek/api/routers/index";
import { handleIncomingMessage } from "agent/src/reply";

import type { SurfaceName } from "./cases";

export type ObservedRun = Pick<AgentRun, "modelId" | "provider" | "toolsCalled"> & {
  costUsd: number | undefined;
};

export type SurfaceReply = {
  text: string;
  latencyMs: number;
  /** Present only where the surface can see inside the model run. */
  run?: ObservedRun;
};

export type SurfaceContext = {
  runId: string;
  /** Unique per case, so WhatsApp threads and bookings never collide. */
  guestPhone: string;
};

export type Surface = {
  name: SurfaceName;
  /** Where in the product this is, in plain words, for the report. */
  where: string;
  available(): Promise<boolean>;
  converse(turns: string[], context: SurfaceContext): Promise<SurfaceReply>;
};

export const SESSION_PREFIX = {
  router: "eval-router-",
  http: "eval-http-",
} as const;

const API_URL = (process.env.EVAL_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

function observe(run: AgentRun): ObservedRun {
  return {
    modelId: run.modelId,
    provider: run.provider,
    toolsCalled: run.toolsCalled,
    costUsd: run.usage.costUsd,
  };
}

/** Replays the conversation against an agent directly, carrying history between turns. */
async function converseDirect(
  turns: string[],
  runTurn: (messages: ConciergeMessage[]) => Promise<AgentRun>,
): Promise<SurfaceReply> {
  const messages: ConciergeMessage[] = [];
  let last: AgentRun | undefined;
  const toolsAcrossTurns: string[] = [];

  for (const turn of turns) {
    messages.push({ role: "user", content: turn });
    last = await runTurn(messages);
    toolsAcrossTurns.push(...last.toolsCalled);
    messages.push({ role: "assistant", content: last.text });
  }

  if (!last) throw new Error("a case needs at least one turn");
  return {
    text: last.text,
    latencyMs: last.latencyMs,
    run: { ...observe(last), toolsCalled: toolsAcrossTurns },
  };
}

const createCaller = t.createCallerFactory(appRouter);

export const surfaces: Record<SurfaceName, Surface> = {
  concierge: {
    name: "concierge",
    where: "Website concierge agent, called directly (packages/ai runConcierge)",
    available: async () => true,
    converse: (turns) =>
      converseDirect(turns, (messages) => runConcierge(messages, { today: todayInHarare() })),
  },

  "concierge-router": {
    name: "concierge-router",
    where: "Website chat through the real tRPC router, with persistence (chat.send)",
    available: async () => true,
    async converse(turns, context) {
      const caller = createCaller({ session: null });
      const sessionId = SESSION_PREFIX.router + context.runId;
      let text = "";
      let latencyMs = 0;
      for (const turn of turns) {
        const startedAt = Date.now();
        const result = await caller.chat.send({ sessionId, content: turn });
        latencyMs = Date.now() - startedAt;
        text = result.reply.content;
      }
      return { text, latencyMs };
    },
  },

  "concierge-http": {
    name: "concierge-http",
    where: `Website chat over HTTP against the running API (${API_URL}/trpc/chat.send)`,
    async available() {
      try {
        const response = await fetch(API_URL + "/", { signal: AbortSignal.timeout(3000) });
        return response.ok;
      } catch {
        return false;
      }
    },
    async converse(turns, context) {
      const sessionId = SESSION_PREFIX.http + context.runId;
      let text = "";
      let latencyMs = 0;
      for (const turn of turns) {
        const startedAt = Date.now();
        const response = await fetch(`${API_URL}/trpc/chat.send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, content: turn }),
        });
        latencyMs = Date.now() - startedAt;
        const body = (await response.json()) as {
          result?: { data?: { reply?: { content?: string } } };
          error?: { message?: string };
        };
        if (!response.ok || !body.result?.data?.reply?.content) {
          throw new Error(`HTTP ${response.status}: ${body.error?.message ?? "no reply in response"}`);
        }
        text = body.result.data.reply.content;
      }
      return { text, latencyMs };
    },
  },

  "booking-agent": {
    name: "booking-agent",
    where: "WhatsApp booking agent, called directly, without grounding (packages/ai runBookingAgent)",
    available: async () => true,
    converse: (turns, context) =>
      converseDirect(turns, (messages) =>
        runBookingAgent(messages, {
          today: todayInHarare(),
          guestPhone: context.guestPhone,
          channel: "whatsapp",
        }),
      ),
  },

  whatsapp: {
    name: "whatsapp",
    where: "WhatsApp message pipeline, with grounding, formatting and persistence (apps/agent)",
    available: async () => true,
    async converse(turns, context) {
      const chatId = `${context.guestPhone.replace("+", "")}@c.us`;
      let text = "";
      let latencyMs = 0;
      const tools: string[] = [];
      let run: ObservedRun | undefined;
      for (const turn of turns) {
        const startedAt = Date.now();
        const result = await handleIncomingMessage({ chatId, body: turn });
        latencyMs = Date.now() - startedAt;
        if (!result.handled) throw new Error(`message not handled: ${result.reason}`);
        text = result.reply;
        if (result.run) {
          tools.push(...result.run.toolsCalled);
          run = { ...result.run, toolsCalled: tools };
        }
      }
      return { text, latencyMs, run };
    },
  },
};
