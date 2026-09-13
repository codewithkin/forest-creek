"use client";

import { useEffect } from "react";

import { buttonClass } from "@/components/brand/button";
import { lodge } from "@/components/site-footer";

export default function SiteError({
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
    <section
      role="alert"
      className="mx-auto flex max-w-2xl flex-col items-center px-5 py-28 text-center"
    >
      <p className="text-xs font-medium tracking-[0.25em] text-accent uppercase">
        Something went wrong
      </p>
      <h1 className="mt-4 font-display text-4xl leading-tight font-light sm:text-5xl">
        This page didn&rsquo;t load
      </h1>
      <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
        It&rsquo;s usually brief, so try again. If it keeps happening, you can always reach us on{" "}
        {lodge.phone} or {lodge.email}.
      </p>
      <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={() => retry()}
          className={buttonClass({ shape: "pill", size: "lg" })}
        >
          Try again
        </button>
        <a href="/" className={buttonClass({ variant: "secondary", shape: "pill", size: "lg" })}>
          Back to the lodges
        </a>
      </div>
      {error.digest && (
        <p className="mt-8 font-mono text-xs text-muted-foreground">Ref {error.digest}</p>
      )}
    </section>
  );
}
