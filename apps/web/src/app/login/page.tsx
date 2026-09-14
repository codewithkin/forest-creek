import type { Metadata } from "next";
import Link from "next/link";

import SignInForm from "@/components/sign-in-form";
import { mediaUrl } from "@/lib/server-url";

export const metadata: Metadata = {
  title: "Staff sign in — Forest Creek",
};

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <img
          src={mediaUrl("/media/forest-walk.webp")}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <p className="max-w-md font-display text-3xl leading-snug font-light">
            &ldquo;Every stay planted lightly among the trees.&rdquo;
          </p>
          <p className="mt-3 text-sm text-muted-foreground">Forest Creek · Vumba highlands</p>
        </div>
      </div>

      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="inline-flex items-center gap-2 font-display text-xl tracking-wide">
          <img
            src="/brand-icon.png"
            alt=""
            className="h-6 w-6 rounded-md object-cover ring-1 ring-accent/30"
          />
          Forest Creek
        </Link>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-3xl sm:text-4xl">Staff sign in</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            For the lodge team. Guests don&rsquo;t need an account to book or chat.
          </p>
          <div className="mt-8">
            <SignInForm />
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            Can&rsquo;t get in? Ask the owner to check your access.
          </p>
        </div>
      </div>
    </main>
  );
}
