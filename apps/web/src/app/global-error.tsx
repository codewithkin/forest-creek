"use client";

import "../index.css";

import { buttonClass } from "@/components/brand/button";
import { lodge } from "@/components/site-footer";

/**
 * Replaces the root layout when the layout itself fails, so it renders its own
 * document and styles. Kept deliberately plain: it must work when little else does.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        <title>Something went wrong — Forest Creek</title>
        <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
          <p className="font-display text-2xl">Forest Creek</p>
          <h1 className="mt-12 font-display text-4xl font-light sm:text-5xl">
            Something went wrong
          </h1>
          <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
            The site hit a problem it couldn&rsquo;t recover from. Try again &mdash; and if it keeps
            happening, reach us on {lodge.phone}.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className={buttonClass({ shape: "pill", size: "lg", className: "mt-8" })}
          >
            Try again
          </button>
          {error.digest && (
            <p className="mt-6 font-mono text-xs text-muted-foreground">Ref {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
