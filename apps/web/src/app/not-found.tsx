import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/brand/button";

export const metadata: Metadata = {
  title: "Page not found — Forest Creek",
};

/** For URLs that match no route at all, outside the site's header and footer. */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center px-6 py-10 text-center">
      <Link href="/" className="font-display text-2xl tracking-wide">
        Forest Creek
      </Link>

      <div className="flex flex-1 flex-col items-center justify-center py-16">
        <p className="text-xs font-medium tracking-[0.25em] text-accent uppercase">Error 404</p>
        <h1 className="mt-4 max-w-2xl font-display text-5xl leading-[1.05] font-light sm:text-6xl">
          You&rsquo;ve wandered off the trail
        </h1>
        <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
          The page you were looking for isn&rsquo;t here. It may have moved, or the link may have
          a typo in it.
        </p>
        <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/" className={buttonClass({ shape: "pill", size: "lg" })}>
            Back to the lodges
          </Link>
          <Link
            href="/book"
            className={buttonClass({ variant: "secondary", shape: "pill", size: "lg" })}
          >
            Book a stay
          </Link>
        </div>
      </div>
    </main>
  );
}
