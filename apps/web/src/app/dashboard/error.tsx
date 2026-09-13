"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { buttonClass } from "@/components/brand/button";

/** Renders inside the dashboard shell, so navigation stays usable while one view is broken. */
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <h1 className="mt-5 font-display text-2xl sm:text-3xl">This view didn&rsquo;t load</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Try again. If it keeps failing, the API server may be down or restarting.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className={buttonClass()}>
          Try again
        </button>
        <Link href="/dashboard" className={buttonClass({ variant: "secondary" })}>
          Go to Today
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-xs text-muted-foreground">Ref {error.digest}</p>
      )}
    </div>
  );
}
