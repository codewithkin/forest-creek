"use client";

import { authClient } from "@/lib/auth-client";

/** Whether the signed-in person is the owner: they alone see the delete buttons. The API checks again. */
export function useIsOwner(): boolean {
  const { data } = authClient.useSession();
  return (data?.user as { role?: string } | undefined)?.role === "admin";
}
