"use client";

import type { authClient } from "@/lib/auth-client";

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
  return <p>Signed in as {session.user.name}</p>;
}
