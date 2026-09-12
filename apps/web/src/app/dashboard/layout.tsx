import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import DashboardNav from "./dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });

  if (!session?.user) {
    redirect("/login");
  }

  // A guest account can exist without being staff, so the role is what gates
  // this, not merely being signed in.
  if (session.user.role !== "admin") {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl font-light">Staff only</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          This area is for the Forest Creek team.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full border border-border px-7 py-2.5 text-sm hover:border-accent/50"
        >
          Back to the lodge
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-svh">
      <DashboardNav name={session.user.name} />
      <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
    </div>
  );
}
