import type { AppRouter } from "@forest-creek/api/routers/index";
import { env } from "@forest-creek/env/web";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import { friendlyError } from "@/components/brand/state";
import { getServerUrl } from "@/lib/server-url";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // A first load that fails already shows its own error state in place. A toast
      // only helps when data on screen went stale because a background refresh failed.
      if (query.state.data === undefined) return;
      toast.error(friendlyError(error), {
        action: { label: "Retry", onClick: () => void query.fetch() },
      });
    },
  }),
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getServerUrl(env.NEXT_PUBLIC_SERVER_URL)}/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: "include",
        });
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
