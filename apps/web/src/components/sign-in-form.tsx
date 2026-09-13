"use client";

import { Input } from "@forest-creek/ui/components/input";
import { Label } from "@forest-creek/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import z from "zod";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { authClient } from "@/lib/auth-client";

export default function SignInForm() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [formError, setFormError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);

  // Already signed in: the dashboard is where they were heading anyway.
  useEffect(() => {
    if (session?.user) router.replace("/dashboard");
  }, [session, router]);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setFormError(undefined);
      await authClient.signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess: () => router.push("/dashboard"),
          onError: ({ error }) => {
            setFormError(
              error.status === 401 || error.status === 403
                ? "That email and password don't match a staff account."
                : error.message || "We couldn't sign you in. Please try again.",
            );
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Enter a valid email address"),
        password: z.string().min(8, "Passwords are at least 8 characters"),
      }),
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-5"
    >
      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <form.Field name="email">
        {(field) => {
          const error = field.state.meta.errors[0]?.message;
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Email</Label>
              <Input
                id={field.name}
                name={field.name}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${field.name}-error` : undefined}
                disabled={isPending}
                className="h-11 rounded-lg"
              />
              {error && (
                <p id={`${field.name}-error`} className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      <form.Field name="password">
        {(field) => {
          const error = field.state.meta.errors[0]?.message;
          return (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Password</Label>
              <div className="relative">
                <Input
                  id={field.name}
                  name={field.name}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${field.name}-error` : undefined}
                  disabled={isPending}
                  className="h-11 rounded-lg pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {error && (
                <p id={`${field.name}-error`} className="text-xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <button
            type="submit"
            disabled={isSubmitting || isPending}
            className={buttonClass({ size: "lg", className: "w-full" })}
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
