import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";

import { buttonClass } from "./button";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-secondary/70 ${className}`} />;
}

type StateMessageProps = {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "neutral" | "error";
  className?: string;
};

/** Empty and error states share one shape, so every "nothing here" looks deliberate. */
export function StateMessage({
  icon: Icon = Inbox,
  title,
  description,
  action,
  tone = "neutral",
  className = "",
}: StateMessageProps) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 px-6 py-12 text-center ${className}`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-full ${
          tone === "error" ? "bg-destructive/10 text-destructive" : "bg-secondary text-accent"
        }`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-4 font-display text-xl">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * tRPC, fetch and validation errors are written for developers. Guests and
 * staff get a sentence they can act on; anything unrecognised gets a calm
 * generic one rather than a stack trace or a JSON blob.
 */
export function friendlyError(error?: { message?: string } | null): string {
  const message = error?.message?.trim() ?? "";

  if (/failed to fetch|networkerror|load failed|fetch failed|econnrefused/i.test(message)) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (/unauthori[sz]ed|authentication required/i.test(message)) {
    return "Your session has ended. Sign in again to continue.";
  }
  if (/forbidden|not yours|staff access|owner access/i.test(message)) {
    return "Your account doesn't have access to this.";
  }
  const readable =
    message.length > 0 &&
    message.length < 160 &&
    !/^\s*[[{]/.test(message) &&
    !/trpc|prisma|stack|undefined|null/i.test(message);
  return readable ? message : "Something went wrong on our side. Please try again in a moment.";
}

export function ErrorMessage({
  title = "That didn't load",
  error,
  onRetry,
  className,
}: {
  title?: string;
  error?: { message?: string } | null;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateMessage
      tone="error"
      icon={AlertTriangle}
      title={title}
      description={friendlyError(error)}
      className={className}
      action={
        onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Try again
          </button>
        ) : undefined
      }
    />
  );
}
