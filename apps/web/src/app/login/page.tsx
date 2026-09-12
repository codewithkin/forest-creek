import type { Metadata } from "next";

import SignInForm from "@/components/sign-in-form";

export const metadata: Metadata = {
  title: "Staff sign in — Forest Creek Lodge",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-3xl font-light">Staff sign in</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Guests do not need an account — this is for the lodge team.
      </p>
      <div className="mt-8">
        <SignInForm />
      </div>
    </div>
  );
}
