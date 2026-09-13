"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Leaf, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { friendlyError, Skeleton } from "@/components/brand/state";
import { lodge } from "@/components/site-footer";
import { trpc } from "@/utils/trpc";

const SESSION_KEY = "forest-creek-chat-session";

const SUGGESTIONS = [
  "What rooms do you have?",
  "Is anything free this weekend?",
  "What is there to do nearby?",
];

function loadSessionId(): string {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

export default function ConciergeWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [draft, setDraft] = useState("");
  // The message in flight, shown at once so the guest can see it was taken, and
  // kept on failure so it can be retried rather than silently lost.
  const [outgoing, setOutgoing] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // localStorage exists only once mounted, so the id is resolved here rather
  // than in the initial state.
  useEffect(() => setSessionId(loadSessionId()), []);

  const historyOptions = trpc.chat.history.queryOptions(
    { sessionId: sessionId ?? "" },
    { enabled: Boolean(sessionId) && open },
  );
  const history = useQuery(historyOptions);

  const send = useMutation(
    trpc.chat.send.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: historyOptions.queryKey });
        setOutgoing(undefined);
      },
    }),
  );

  const messages = history.data ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, outgoing, send.isPending, send.isError]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  function deliver(content: string) {
    if (!sessionId || send.isPending) return;
    setOutgoing(content);
    send.mutate({ sessionId, content });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    deliver(content);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass({
          shape: "pill",
          size: "lg",
          className: "fixed right-4 bottom-4 z-50 shadow-lg shadow-black/30 sm:right-5 sm:bottom-5",
        })}
      >
        <MessageCircle aria-hidden />
        Ask the Guide
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Chat with The Vumba Guide"
      className="fixed inset-x-3 bottom-3 z-50 flex max-h-[min(36rem,85svh)] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl shadow-black/40 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[24rem]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-accent">
            <Leaf className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-lg leading-none">The Vumba Guide</h2>
            <p className="mt-1 text-xs text-muted-foreground">Usually answers in a few seconds</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          className={buttonClass({ variant: "ghost", size: "sm", shape: "pill", className: "w-8 px-0" })}
        >
          <X />
        </button>
      </header>

      <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {history.isLoading && (
          <div className="space-y-3" aria-hidden>
            <Skeleton className="h-10 w-3/4 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
          </div>
        )}

        {history.isError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            <p>{friendlyError(history.error)}</p>
            <button
              type="button"
              onClick={() => void history.refetch()}
              className={buttonClass({ variant: "ghost", size: "sm", className: "mt-1 -ml-2" })}
            >
              <RotateCcw aria-hidden />
              Try again
            </button>
          </div>
        )}

        {history.isSuccess && messages.length === 0 && !outgoing && (
          <div className="py-4 text-center">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ask about rooms, rates, dates, or what a day in the Vumba looks like.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => deliver(suggestion)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <Bubble key={message.id} sender={message.sender} content={message.content} />
        ))}

        {outgoing && (
          <Bubble
            sender="guest"
            content={outgoing}
            state={send.isError ? "failed" : "sending"}
            failure={send.isError ? friendlyError(send.error) : undefined}
            onRetry={() => deliver(outgoing)}
          />
        )}

        {send.isPending && <TypingIndicator />}
      </div>

      <form onSubmit={submit} className="border-t border-border/70 p-3">
        <div className="flex items-center gap-2">
          <label htmlFor="concierge-message" className="sr-only">
            Message
          </label>
          <input
            id="concierge-message"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={4000}
            autoComplete="off"
            placeholder="Ask the Guide…"
            className="h-10 flex-1 rounded-full bg-secondary px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={!draft.trim() || send.isPending || !sessionId}
            aria-label="Send message"
            className={buttonClass({ shape: "pill", className: "w-10 px-0" })}
          >
            <Send aria-hidden />
          </button>
        </div>
        <p className="mt-2 px-1 text-[0.7rem] text-muted-foreground">
          An AI concierge. For anything urgent, call {lodge.phone}.
        </p>
      </form>
    </div>
  );
}

function Bubble({
  sender,
  content,
  state,
  failure,
  onRetry,
}: {
  sender: string;
  content: string;
  state?: "sending" | "failed";
  failure?: string;
  onRetry?: () => void;
}) {
  if (sender === "guest") {
    return (
      <div className="ml-auto flex max-w-[85%] flex-col items-end">
        <p
          className={`rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-foreground ${
            state === "sending" ? "opacity-70" : ""
          }`}
        >
          {content}
        </p>
        {state === "failed" && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 inline-flex items-center gap-1 text-right text-xs text-destructive hover:underline"
          >
            <RotateCcw className="size-3" aria-hidden />
            Not sent. {failure} Tap to retry.
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex max-w-[85%] flex-col items-start">
      {sender === "admin" && (
        <span className="mb-1 text-[0.7rem] font-medium tracking-wide text-accent">
          Forest Creek team
        </span>
      )}
      <p className="rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div role="status" aria-label="The Vumba Guide is typing" className="flex">
      <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-secondary px-4 py-3.5">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
