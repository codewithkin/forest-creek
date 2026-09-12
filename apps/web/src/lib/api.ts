import type { AppRouter } from "@forest-creek/api/routers/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

import { getServerUrl } from "./server-url";

/**
 * Plain tRPC client for server components. Kept apart from utils/trpc, whose
 * query cache pulls in toast handling that has no place on the server.
 */
export const api = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${getServerUrl()}/trpc` })],
});
