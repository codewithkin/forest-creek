import { auth } from "@forest-creek/auth";
import type { Context as HonoContext } from "hono";
import { getConnInfo } from "hono/bun";

import { clientAddress } from "./rate-limit";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return { session, clientIp: clientIpOf(context) };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

function clientIpOf(context: HonoContext): string {
  let socket: string | undefined;
  try {
    socket = getConnInfo(context).remote.address;
  } catch {
    // Not served by Bun (tests calling the router directly): no socket.
  }
  return clientAddress(context.req.header("x-forwarded-for"), socket);
}
