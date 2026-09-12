"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Leaf, Loader2, MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { trpc } from "@/utils/trpc";

const SESSION_KEY = "forest-creek-chat-session";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // localStorage is only available once mounted, so the id is resolved here
  // rather than in the initial state.
  useEffect(() => setSessionId(loadSessionId()), []);

  const historyOptions = trpc.chat.history.queryOptions(
    { sessionId: sessionId ?? "" },
    { enabled: Boolean(sessionId) && open },
  );
  const history = useQuery(historyOptions);

  const send = useMutation(
    trpc.chat.send.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: historyOptions.queryKey }),
    }),
  );

  const messages = history.data ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, send.isPending]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !sessionId || send.isPending) return;
    setDraft("");
    send.mutate({ sessionId, content });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask The Vumba Guide"
        className="fixed right-5 bottom-5 z-50 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-medium text-accent-foreground shadow-lg transition-opacity hover:opacity-90"
      >
        <MessageCircle className="h-4 w-4" />
        Ask the Guide
      </button>
    );
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex max-h-[min(34rem,80svh)] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Leaf className="h-4 w-4 text-accent" />
          <div>
            <h2 className="font-display text-lg leading-none">The Vumba Guide</h2>
            <p className="mt-1 text-xs text-muted-foreground">Concierge at Forest Creek</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          className="rounded-full p-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && !history.isPending && (
          <p className="py-6 text-center text-sm leading-relaxed text-muted-foreground">
            Ask about rooms, rates or what a day here looks like.
          </p>
        )}

        {messages.map((message) => (
          <Bubble key={message.id} sender={message.sender} content={message.content} />
        ))}

        {send.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking…
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-border/70 p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a question…"
          aria-label="Message"
          className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || send.isPending}
          aria-label="Send"
          className="rounded-full bg-accent p-2.5 text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function Bubble({ sender, content }: { sender: string; content: string }) {
  if (sender === "guest") {
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm text-accent-foreground">
        {content}
      </p>
    );
  }

  return (
    <div className="w-fit max-w-[85%]">
      {sender === "admin" && (
        <span className="mb-1 block text-[0.65rem] tracking-wider text-accent uppercase">
          Forest Creek staff
        </span>
      )}
      <p className="rounded-2xl rounded-bl-sm bg-secondary px-4 py-2.5 text-sm whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
