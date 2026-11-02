"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError, Skeleton } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { BookingDrawer } from "./booking-drawer";
import { Panel } from "./ui/page";

type Stay = { id: string; reference: string; guestName: string; guests: number; roomName: string; checkOut: string; checkIn: string };

function shortDay(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
}

/** Who needs checking in or out today, one click each. */
export function TodayStays({ today, propertyId }: { today: string; propertyId?: string }) {
  const stays = useQuery(trpc.bookings.today.queryOptions({ today, propertyId }));
  const [openId, setOpenId] = useState<string>();
  const queryClient = useQueryClient();
  const handlers = (message: string) => ({
    onSuccess: async () => {
      toast.success(message);
      await queryClient.invalidateQueries();
    },
    onError: (error: { message?: string }) => toast.error(friendlyError(error)),
  });
  const checkIn = useMutation(trpc.bookings.checkIn.mutationOptions(handlers("Checked in")));
  const checkOut = useMutation(trpc.bookings.checkOut.mutationOptions(handlers("Checked out")));

  if (stays.isPending) return <Skeleton className="h-32 w-full rounded-3xl" />;
  if (!stays.data) return null;
  const { arrivals, inHouse, departures } = stays.data;
  if (arrivals.length + inHouse.length + departures.length === 0) return null;

  // Called, not rendered as a component: a component defined here would be a
  // new one each render, and the button just pressed would lose focus.
  const list = (title: string, rows: Stay[], action: "in" | "out") => {
    return (
      <div>
        <p className="text-xs text-muted-foreground">
          {title} · {rows.length}
        </p>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nobody.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((stay) => {
              const pending =
                (action === "in" && checkIn.isPending && checkIn.variables === stay.id) ||
                (action === "out" && checkOut.isPending && checkOut.variables === stay.id);
              return (
                <li key={stay.id} className="flex items-center justify-between gap-2 rounded-2xl bg-secondary/50 px-3 py-2">
                  <button type="button" onClick={() => setOpenId(stay.id)} className="min-w-0 text-left">
                    <span className="block truncate text-sm">{stay.guestName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {stay.roomName} · {action === "in" ? `to ${shortDay(stay.checkOut)}` : `leaves ${shortDay(stay.checkOut)}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => (action === "in" ? checkIn : checkOut).mutate(stay.id)}
                    className={buttonClass({ variant: "secondary", size: "sm", shape: "pill" })}
                  >
                    {pending && <Spinner />}
                    {action === "in" ? "Check in" : "Check out"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <Panel title="Front desk">
      <div className="grid gap-5 md:grid-cols-3">
        {list("To check in", arrivals, "in")}
        {list("To check out", departures, "out")}
        {list("In house", inHouse, "out")}
      </div>
      <BookingDrawer bookingId={openId} onClose={() => setOpenId(undefined)} />
    </Panel>
  );
}
