import type { AppRouter } from "@forest-creek/api/routers/index";
import { env } from "@forest-creek/env/web";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import { friendlyError } from "@/components/brand/state";
import { askForPassword } from "@/lib/password-prompt";
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

/**
 * Every delete needs the person's password again (the API refuses it with
 * data.passwordRequired). This asks for it and sends the same delete once
 * more, so no delete button has to know about the password.
 */
const passwordBeforeDeleting: TRPCLink<AppRouter> = () => ({ op, next }) =>
  observable((observer) => {
    let subscription = next(op).subscribe({
      next: (value) => observer.next(value),
      complete: () => observer.complete(),
      error: (error) => {
        const needsPassword = (error.data as { passwordRequired?: boolean } | undefined)?.passwordRequired;
        if (op.type !== "mutation" || !needsPassword) return observer.error(error);
        void askForPassword().then((entered) => {
          if (!entered) return observer.error(error);
          subscription = next(op).subscribe(observer);
        });
      },
    });
    return () => subscription.unsubscribe();
  });

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    passwordBeforeDeleting,
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
