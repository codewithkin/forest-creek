import type { AppRouter } from "@forest-creek/api/routers/index";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

import { dnsFallbackFetch } from "./dns-fallback";
import { resilientFetch } from "./resilient-fetch";
import { getServerUrl, publicServerUrl } from "./server-url";

/**
 * How this app's SERVER reaches the API: SERVER_URL (the internal
 * container-to-container address) first, the public URL as the fallback, with
 * brief network failures retried — see resilient-fetch.ts and dns-fallback.ts.
 */
export const serverFetch = resilientFetch({
  bases: [getServerUrl(), publicServerUrl()],
  // Name lookups fall back to public DNS when the container's resolver fails.
  fetch: dnsFallbackFetch,
});

/**
 * Plain tRPC client for server components. Kept apart from utils/trpc, whose
 * query cache pulls in toast handling that has no place on the server.
 */
export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getServerUrl()}/trpc`,
      fetch: (input, init) => serverFetch(input as string, init as RequestInit),
    }),
  ],
});
