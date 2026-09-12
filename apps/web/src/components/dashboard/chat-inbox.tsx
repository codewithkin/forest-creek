"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

export default function ChatInbox() {
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();

  const sessions = useQuery(trpc.chat.sessions.queryOptions());

  const historyOptions = trpc.chat.history.queryOptions(
    { sessionId: selected ?? "" },
    { enabled: Boolean(selected) },
  );
  const history = useQuery(historyOptions);

  const reply = useMutation(
    trpc.chat.reply.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: historyOptions.queryKey }),
    }),
  );

  return (
    <div>
      <h1 className="font-display text-3xl font-light">Guest chats</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-2">
          {sessions.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
          {sessions.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
          )}
          {sessions.data?.map((session) => (
            <button
              key={session.sessionId}
              type="button"
              onClick={() => setSelected(session.sessionId)}
              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                selected === session.sessionId
                  ? "border-accent"
                  : "border-border/70 hover:border-accent/50"
              }`}
            >
              <p className="truncate font-mono text-xs text-muted-foreground">
                {session.sessionId}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {session.messageCount} messages ·{" "}
                {new Date(session.lastMessageAt).toLocaleString()}
              </p>
            </button>
          ))}
        </aside>

        <section className="rounded-2xl border border-border/70 bg-card">
          {!selected && (
            <p className="p-8 text-sm text-muted-foreground">
              Pick a conversation to read and reply.
            </p>
          )}

          {selected && (
            <>
              <div className="max-h-[28rem] space-y-3 overflow-y-auto p-5">
                {history.data?.map((message) => (
                  <div
                    key={message.id}
                    className={message.sender === "guest" ? "" : "flex justify-end"}
                  >
                    <div className="max-w-[80%]">
                      <span className="mb-1 block text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                        {message.sender === "guest"
                          ? "Guest"
                          : message.sender === "ai"
                            ? "The Vumba Guide"
                            : "You"}
                      </span>
                      <p
                        className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                          message.sender === "admin"
                            ? "bg-accent text-accent-foreground"
                            : "bg-secondary"
                        }`}
                      >
                        {message.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const content = draft.trim();
                  if (!content) return;
                  setDraft("");
                  reply.mutate({ sessionId: selected, content });
                }}
                className="flex items-center gap-2 border-t border-border/70 p-3"
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Reply as the lodge…"
                  aria-label="Reply"
                  className="flex-1 rounded-full bg-secondary px-4 py-2.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || reply.isPending}
                  aria-label="Send reply"
                  className="rounded-full bg-accent p-2.5 text-accent-foreground disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
