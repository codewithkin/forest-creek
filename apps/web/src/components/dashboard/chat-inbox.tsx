"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Globe, MessageCircle, MessagesSquare, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";

const WHATSAPP_PREFIX = "whatsapp:";

type Thread = { label: string; channel: "whatsapp" | "website" };

/** Session ids mean nothing to staff; a phone number or a short visitor tag does. */
function describeThread(sessionId: string): Thread {
  if (sessionId.startsWith(WHATSAPP_PREFIX)) {
    const digits = sessionId.slice(WHATSAPP_PREFIX.length);
    const label =
      digits.startsWith("263") && digits.length === 12
        ? `+263 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
        : `+${digits}`;
    return { label, channel: "whatsapp" };
  }
  return { label: `Website visitor ${sessionId.slice(-4).toUpperCase()}`, channel: "website" };
}

function timeAgo(value: string | Date): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export default function ChatInbox() {
  const { selectedId } = useProperties();
  const [selected, setSelected] = useState<{ sessionId: string; propertyId: string | null }>();
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const sessions = useQuery(trpc.chat.sessions.queryOptions({ propertyId: selectedId }));

  const historyOptions = trpc.chat.history.queryOptions(
    { sessionId: selected?.sessionId ?? "" },
    { enabled: Boolean(selected) },
  );
  const history = useQuery(historyOptions);

  const reply = useMutation(
    trpc.chat.reply.mutationOptions({
      onSuccess: async () => {
        // Cleared only once saved, so a failed send never loses what staff typed.
        setDraft("");
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: historyOptions.queryKey }),
          queryClient.invalidateQueries({ queryKey: trpc.chat.sessions.queryKey() }),
        ]);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [history.data?.length, selected?.sessionId]);

  const thread = selected ? describeThread(selected.sessionId) : undefined;
  const waiting = sessions.data?.filter((session) => session.needsReply).length ?? 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!selected || !content || reply.isPending) return;
    reply.mutate({
      sessionId: selected.sessionId,
      propertyId: selected.propertyId ?? undefined,
      content,
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl sm:text-3xl">Guest chats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {!sessions.data
            ? "Website and WhatsApp conversations"
            : waiting > 0
              ? `${waiting} ${waiting === 1 ? "guest is" : "guests are"} waiting on a reply`
              : "Every guest has an answer"}
        </p>
      </header>

      <div className="grid overflow-hidden rounded-xl border border-border/70 bg-card lg:h-[calc(100svh-14rem)] lg:min-h-[32rem] lg:grid-cols-[20rem_1fr]">
        {/* On a phone the list is the whole view until a thread is opened. */}
        <aside
          className={`${selected ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-border/70 lg:border-r`}
        >
          {sessions.isPending && (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {sessions.isError && (
            <ErrorMessage
              className="m-3"
              title="Chats didn't load"
              error={sessions.error}
              onRetry={() => void sessions.refetch()}
            />
          )}

          {sessions.data?.length === 0 && (
            <StateMessage
              className="m-3 border-0"
              icon={MessagesSquare}
              title="No conversations yet"
              description="Questions from the website chat and WhatsApp will appear here."
            />
          )}

          <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
            {sessions.data?.map((session) => {
              const info = describeThread(session.sessionId);
              const active = selected?.sessionId === session.sessionId;
              return (
                <li key={session.sessionId}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected({ sessionId: session.sessionId, propertyId: session.propertyId })
                    }
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                      active ? "bg-secondary" : "hover:bg-secondary/50"
                    }`}
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                      {info.channel === "whatsapp" ? (
                        <MessageCircle className="size-4" aria-hidden />
                      ) : (
                        <Globe className="size-4" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{info.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {timeAgo(session.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {session.needsReply ? (
                          <span className="rounded-md bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
                            Needs reply
                          </span>
                        ) : (
                          <span>
                            {session.lastSender === "admin" ? "You replied" : "Answered by the Guide"}
                          </span>
                        )}
                        <span>
                          {session.messageCount} {session.messageCount === 1 ? "message" : "messages"}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section
          className={`${selected ? "flex" : "hidden lg:flex"} min-h-[70svh] flex-col lg:min-h-0`}
        >
          {!selected && (
            <StateMessage
              className="m-auto border-0"
              icon={MessagesSquare}
              title="Pick a conversation"
              description="Read the whole thread and reply as the lodge."
            />
          )}

          {selected && thread && (
            <>
              <div className="flex items-center gap-2 border-b border-border/70 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setSelected(undefined)}
                  aria-label="Back to conversations"
                  className={buttonClass({ variant: "ghost", size: "sm", className: "w-8 px-0 lg:hidden" })}
                >
                  <ArrowLeft />
                </button>
                <div className="min-w-0 px-1">
                  <p className="truncate text-sm font-medium">{thread.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {thread.channel === "whatsapp" ? "WhatsApp" : "Website chat"}
                  </p>
                </div>
              </div>

              <div ref={threadRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                {history.isPending && (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-2/3 rounded-2xl" />
                    <Skeleton className="ml-auto h-16 w-3/4 rounded-2xl" />
                    <Skeleton className="h-10 w-1/2 rounded-2xl" />
                  </div>
                )}

                {history.isError && (
                  <ErrorMessage
                    title="This thread didn't load"
                    error={history.error}
                    onRetry={() => void history.refetch()}
                  />
                )}

                {history.data?.map((message) => (
                  <ThreadMessage
                    key={message.id}
                    sender={message.sender}
                    content={message.content}
                    at={message.createdAt}
                  />
                ))}
              </div>

              <form onSubmit={submit} className="border-t border-border/70 p-3">
                <div className="flex items-end gap-2">
                  <label htmlFor="staff-reply" className="sr-only">
                    Reply as the lodge
                  </label>
                  <textarea
                    id="staff-reply"
                    rows={1}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    maxLength={4000}
                    placeholder="Reply as the lodge…"
                    className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || reply.isPending}
                    aria-label="Send reply"
                    className={buttonClass({ className: "w-10 px-0" })}
                  >
                    {reply.isPending ? <Spinner /> : <Send aria-hidden />}
                  </button>
                </div>
                {thread.channel === "whatsapp" && (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Saved to this thread. Delivering it to the guest&rsquo;s WhatsApp isn&rsquo;t
                    connected yet, so contact them directly for anything time-sensitive.
                  </p>
                )}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ThreadMessage({ sender, content, at }: { sender: string; content: string; at: string | Date }) {
  const fromGuest = sender === "guest";
  const author = fromGuest ? "Guest" : sender === "ai" ? "The Vumba Guide" : "Lodge team";

  return (
    <div className={`flex flex-col ${fromGuest ? "items-start" : "items-end"}`}>
      <span className="mb-1 text-xs text-muted-foreground">
        {author} · {new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <p
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          fromGuest
            ? "rounded-tl-md bg-secondary"
            : sender === "admin"
              ? "rounded-tr-md bg-accent text-accent-foreground"
              : "rounded-tr-md border border-border/70"
        }`}
      >
        {content}
      </p>
    </div>
  );
}
