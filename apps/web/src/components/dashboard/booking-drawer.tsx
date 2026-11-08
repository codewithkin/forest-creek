"use client";

import type { AppRouter } from "@forest-creek/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { BedDouble, ClipboardSignature, Download, LogIn, LogOut, Pencil, ReceiptText, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, Skeleton } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { BookingActivity } from "./booking-activity";
import { bookingChip, channelName, paymentChip, paymentMethodNames, sourceNames } from "./booking-labels";
import { BookingPolicyActions } from "./booking-policy-actions";
import { DocumentList } from "./document-list";
import { InvoiceBuilder } from "./invoice-builder";
import { RegistrationBuilder } from "./registration-builder";
import { useIsOwner } from "./use-owner";
import { money } from "./kpi";
import { RefundPanel } from "./refund-panel";
import { Drawer } from "./ui/overlay";
import { StatusChip } from "./ui/page";

const inputClass =
  "mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

function day(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function moment(value: string): string {
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

type Editing = "none" | "details" | "room" | "experiences";

/** Everything about one booking, and everything staff can do to it. */
export function BookingDrawer({ bookingId, onClose }: { bookingId?: string; onClose: () => void }) {
  const booking = useQuery({ ...trpc.bookings.byId.queryOptions(bookingId ?? ""), enabled: Boolean(bookingId) });
  const data = booking.data;
  return (
    <Drawer
      open={Boolean(bookingId)}
      onClose={onClose}
      title={data?.guestName ?? "Booking"}
      description={data ? <span className="font-mono tracking-wider text-accent">{data.reference}</span> : undefined}
    >
      {booking.isPending && <Skeleton className="h-64 w-full rounded-2xl" />}
      {booking.isError && <ErrorMessage title="This booking didn't load" error={booking.error} onRetry={() => void booking.refetch()} />}
      {data && <Body key={data.id} booking={data} onDeleted={onClose} />}
    </Drawer>
  );
}

type Booking = inferRouterOutputs<AppRouter>["bookings"]["byId"];

function Body({ booking, onDeleted }: { booking: Booking; onDeleted: () => void }) {
  const [editing, setEditing] = useState<Editing>("none");
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const isOwner = useIsOwner();
  const queryClient = useQueryClient();
  const ended = booking.bookingStatus === "cancelled" || booking.bookingStatus === "expired";
  const status = bookingChip(booking);
  const payment = paymentChip(booking.paymentStatus);
  const balance = Math.max(0, booking.totalAmount - booking.amountPaid);

  const done = (message: string) => ({
    onSuccess: async () => {
      toast.success(message);
      setEditing("none");
      setConfirmingReject(false);
      await queryClient.invalidateQueries();
    },
    onError: (error: { message?: string }) => toast.error(friendlyError(error)),
  });
  const checkIn = useMutation(trpc.bookings.checkIn.mutationOptions(done("Checked in")));
  const checkOut = useMutation(trpc.bookings.checkOut.mutationOptions(done("Checked out")));
  const undo = useMutation(trpc.bookings.undoCheckIn.mutationOptions(done("Check-in undone")));
  const reject = useMutation(trpc.bookings.setPaymentStatus.mutationOptions(done("Payment rejected")));

  const canSettle = (booking.paymentStatus === "pending" || booking.paymentStatus === "processing") && !ended;
  const busy = checkIn.isPending || checkOut.isPending || undo.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <StatusChip tone={payment.tone}>{payment.label}</StatusChip>
        <span className="text-xs text-muted-foreground">
          {channelName(booking.channel)}
          {booking.source ? ` · ${sourceNames[booking.source] ?? booking.source}` : ""}
        </span>
      </div>

      {booking.reviewNote && (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-rose-300">
          Needs attention: {booking.reviewNote}
        </p>
      )}

      {!ended && (
        <div className="flex flex-wrap gap-2">
          {!booking.checkedInAt && (
            <button type="button" disabled={busy} onClick={() => checkIn.mutate(booking.id)} className={buttonClass({ size: "sm" })}>
              {checkIn.isPending ? <Spinner /> : <LogIn aria-hidden />}
              Check in
            </button>
          )}
          {booking.checkedInAt && !booking.checkedOutAt && (
            <>
              <button type="button" disabled={busy} onClick={() => checkOut.mutate(booking.id)} className={buttonClass({ size: "sm" })}>
                {checkOut.isPending ? <Spinner /> : <LogOut aria-hidden />}
                Check out
              </button>
              <button type="button" disabled={busy} onClick={() => undo.mutate(booking.id)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                <RotateCcw aria-hidden />
                Undo check-in
              </button>
            </>
          )}
          <button type="button" onClick={() => setEditing(editing === "details" ? "none" : "details")} className={buttonClass({ variant: "secondary", size: "sm" })}>
            <Pencil aria-hidden />
            Edit guest
          </button>
          <button type="button" onClick={() => setEditing(editing === "room" ? "none" : "room")} className={buttonClass({ variant: "secondary", size: "sm" })}>
            <BedDouble aria-hidden />
            Move room
          </button>
          <button type="button" onClick={() => setEditing(editing === "experiences" ? "none" : "experiences")} className={buttonClass({ variant: "secondary", size: "sm" })}>
            <Sparkles aria-hidden />
            Experiences
          </button>
        </div>
      )}
      {invoicing && <InvoiceBuilder bookingId={booking.id} onClose={() => setInvoicing(false)} onIssued={() => setInvoicing(false)} />}

      {editing === "details" && <DetailsForm booking={booking} onDone={done("Saved")} />}
      {editing === "room" && <MoveRoomForm booking={booking} onDone={done("Moved")} />}
      {editing === "experiences" && <ExperiencesForm booking={booking} onDone={done("Experiences updated")} />}

      <dl className="divide-y divide-border/40 rounded-2xl bg-card px-4 py-2">
        <Row label="Stay">
          {day(booking.checkIn)} – {day(booking.checkOut)}
        </Row>
        <Row label="Room">
          {booking.roomName}, {booking.propertyName}
        </Row>
        <Row label="Guests">{booking.guests}</Row>
        <Row label="Email">{booking.guestEmail || "None given"}</Row>
        <Row label="Phone">{booking.guestPhone || "None given"}</Row>
        {booking.activityNames.length > 0 && <Row label="Experiences">{booking.activityNames.join(", ")}</Row>}
        {booking.createdBy && <Row label="Entered by">{booking.createdBy}</Row>}
        {booking.verifiedBy && <Row label="Handled by">{booking.verifiedBy}</Row>}
      </dl>

      {booking.notes && <p className="rounded-2xl bg-secondary/60 px-3 py-2.5 text-sm whitespace-pre-wrap text-muted-foreground">{booking.notes}</p>}

      {booking.groupRef && <GroupPanel groupRef={booking.groupRef} current={booking.id} />}

      <dl className="divide-y divide-border/40 rounded-2xl bg-card px-4 py-2">
        {booking.groupRef && <p className="pt-2 text-[0.65rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">This room only</p>}
        <Row label="Rate">
          {money(booking.roomRate)} × {booking.nights} {booking.nights === 1 ? "night" : "nights"}
        </Row>
        {booking.rateNote && <Row label="Agreed because">{booking.rateNote}</Row>}
        <Row label="Total">
          <span className="font-display text-xl">{money(booking.totalAmount)}</span>
        </Row>
        <Row label="Paid">{money(booking.amountPaid)}</Row>
        {balance > 0 && (
          <Row label="Still owed">
            <span className="text-accent">
              {money(balance)}
              {booking.balanceDueAt ? ` by ${day(booking.balanceDueAt)}` : ""}
            </span>
          </Row>
        )}
        <PaidByRow bookingId={booking.id} chosen={booking.paymentMethod} number={booking.mobileMoneyNumber} />
        {(booking.paymentStatus === "processing" || booking.paynowChargeAmount !== null) && (
          <Row label="In progress">
            <span className="text-accent">Waiting for the guest{booking.paynowChargeAmount ? ` to approve ${money(booking.paynowChargeAmount)}` : ""}</span>
          </Row>
        )}
      </dl>

      {!ended && <BookingPolicyActions booking={booking} />}

      {canSettle &&
        (confirmingReject ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Reject this payment?</span>
            <button
              type="button"
              disabled={reject.isPending}
              onClick={() => reject.mutate({ id: booking.id, paymentStatus: "rejected" })}
              className={buttonClass({ variant: "danger", size: "sm" })}
            >
              {reject.isPending && <Spinner />}
              Reject
            </button>
            <button type="button" onClick={() => setConfirmingReject(false)} className={buttonClass({ variant: "ghost", size: "sm" })}>
              Keep
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingReject(true)} className={buttonClass({ variant: "ghost", size: "sm" })}>
            <X aria-hidden />
            Reject payment
          </button>
        ))}

      <RefundPanel booking={booking} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 px-4 py-3">
        <p className="text-sm">
          <span className="block font-medium">Invoice</span>
          <span className="block text-xs text-muted-foreground">Made from this stay: room, nights, experiences and what&rsquo;s paid.</span>
        </p>
        <button type="button" onClick={() => setInvoicing(true)} className={buttonClass({ variant: "secondary", size: "sm" })}>
          <ReceiptText aria-hidden />
          Create invoice
        </button>
      </div>
      <RegistrationPanel bookingId={booking.id} />
      <DocumentList bookingId={booking.id} />
      <BookingActivity booking={booking} />
      <History bookingId={booking.id} />
      {isOwner && <DeleteBooking id={booking.id} reference={booking.reference} onDeleted={onDeleted} />}
    </div>
  );
}

function History({ bookingId }: { bookingId: string }) {
  const events = useQuery(trpc.bookings.events.queryOptions(bookingId));
  if (!events.data?.length) return null;
  return (
    <section>
      <h3 className="font-display text-lg">History</h3>
      <ol className="mt-3 space-y-3 border-l border-border/60 pl-4">
        {events.data.map((event) => (
          <li key={event.id} className="text-sm">
            <p>{event.detail}</p>
            <p className="text-xs text-muted-foreground">
              {moment(event.createdAt)} · {event.actor === "system" ? "Automatic" : event.actor}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

type FormProps = {
  booking: Booking;
  onDone: { onSuccess: () => Promise<void>; onError: (error: { message?: string }) => void };
};

function DetailsForm({ booking, onDone }: FormProps) {
  const [draft, setDraft] = useState({
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone ?? "",
    guests: String(booking.guests),
    notes: booking.notes ?? "",
  });
  const save = useMutation(trpc.bookings.updateDetails.mutationOptions(onDone));
  const set = (key: keyof typeof draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ id: booking.id, ...draft, guests: Number(draft.guests) });
      }}
      className="grid gap-3 rounded-2xl border border-border/60 p-4 sm:grid-cols-2"
    >
      <label className="text-xs">
        Guest name
        <input required value={draft.guestName} onChange={set("guestName")} className={inputClass} />
      </label>
      <label className="text-xs">
        Guests
        <input required type="number" min={1} value={draft.guests} onChange={set("guests")} className={inputClass} />
      </label>
      <label className="text-xs">
        Email
        <input type="email" value={draft.guestEmail} onChange={set("guestEmail")} className={inputClass} />
      </label>
      <label className="text-xs">
        Phone
        <input value={draft.guestPhone} onChange={set("guestPhone")} className={inputClass} />
      </label>
      <label className="text-xs sm:col-span-2">
        Notes
        <textarea rows={3} value={draft.notes} onChange={set("notes")} className={inputClass} />
      </label>
      <button type="submit" disabled={save.isPending} className={buttonClass({ size: "sm", className: "sm:col-span-2" })}>
        {save.isPending && <Spinner />}
        Save changes
      </button>
    </form>
  );
}

function MoveRoomForm({ booking, onDone }: FormProps) {
  const rooms = useQuery(trpc.properties.rooms.queryOptions({ propertyId: booking.propertyId }));
  const [roomId, setRoomId] = useState("");
  const move = useMutation(trpc.bookings.moveRoom.mutationOptions(onDone));
  const others = rooms.data?.filter((room) => room.active && room.id !== booking.roomId) ?? [];
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (roomId) move.mutate({ id: booking.id, roomId });
      }}
      className="rounded-2xl border border-border/60 p-4"
    >
      <p className="text-sm text-muted-foreground">Same dates and same price. A taken room is refused.</p>
      <label className="mt-3 block text-xs">
        Move to
        <select required value={roomId} onChange={(event) => setRoomId(event.target.value)} className={inputClass}>
          <option value="" disabled>
            Choose a room
          </option>
          {others.map((room) => (
            <option key={room.id} value={room.id} className="bg-popover">
              {room.name} (sleeps {room.capacity})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={move.isPending || !roomId} className={buttonClass({ size: "sm", className: "mt-3" })}>
        {move.isPending && <Spinner />}
        Move stay
      </button>
    </form>
  );
}

function ExperiencesForm({ booking, onDone }: FormProps) {
  const activities = useQuery(trpc.activities.manage.queryOptions({ propertyId: booking.propertyId }));
  const [chosen, setChosen] = useState<string[]>(booking.activityIds);
  const save = useMutation(trpc.bookings.setExperiences.mutationOptions(onDone));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ id: booking.id, activityIds: chosen });
      }}
      className="rounded-2xl border border-border/60 p-4"
    >
      {activities.data?.length === 0 && <p className="text-sm text-muted-foreground">This property has no experiences yet.</p>}
      <div className="space-y-2">
        {activities.data?.map((activity) => (
          <label key={activity.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosen.includes(activity.id)}
                onChange={(event) =>
                  setChosen((current) => (event.target.checked ? [...current, activity.id] : current.filter((id) => id !== activity.id)))
                }
              />
              {activity.name}
            </span>
            <span className="text-muted-foreground">{activity.price === 0 ? "Included" : money(activity.price)}</span>
          </label>
        ))}
      </div>
      <button type="submit" disabled={save.isPending} className={buttonClass({ size: "sm", className: "mt-3" })}>
        {save.isPending && <Spinner />}
        Update experiences
      </button>
    </form>
  );
}

/** The stay's registration cards: fill one in at check-in, the guest signs on the screen. */
function RegistrationPanel({ bookingId }: { bookingId: string }) {
  const cards = useQuery(trpc.registrations.forBooking.queryOptions(bookingId));
  const [filling, setFilling] = useState(false);
  const list = cards.data?.cards ?? [];
  return (
    <div className="rounded-2xl border border-border/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="block font-medium">Registration card</span>
          <span className="block text-xs text-muted-foreground">
            {list.length ? `${list.length} on file` : "Filled in at check-in; the guest signs on the screen."}
          </span>
        </p>
        <button type="button" onClick={() => setFilling(true)} className={buttonClass({ variant: "secondary", size: "sm" })}>
          <ClipboardSignature aria-hidden />
          {list.length ? "Another card" : "Register guest"}
        </button>
      </div>
      {list.length > 0 && (
        <ul className="mt-2 space-y-1">
          {list.map((card) => (
            <li key={card.id}>
              <a href={`/dashboard/registrations/${card.id}/pdf`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-secondary/60">
                <span>
                  {card.guestName} <span className="font-mono text-xs text-accent">REG-{String(card.number).padStart(4, "0")}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {card.signedAt ? "Signed" : "Not signed"}
                  <Download className="size-3.5" aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {filling && <RegistrationBuilder bookingId={bookingId} onClose={() => setFilling(false)} onSaved={() => setFilling(false)} />}
    </div>
  );
}

/** The owner's delete, for a booking entered by mistake: asks once more, in place. */
function DeleteBooking({ id, reference, onDeleted }: { id: string; reference: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const remove = useMutation(
    trpc.admin.deleteBooking.mutationOptions({
      onSuccess: async () => {
        toast.success(`${reference} deleted`);
        onDeleted();
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3">
      <p className="text-sm">
        <span className="block font-medium">Delete this booking</span>
        <span className="block text-xs text-muted-foreground">Owner only. Its receipts, history and emails go too. It can&rsquo;t be undone.</span>
      </p>
      {asking ? (
        <span className="flex items-center gap-2">
          <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(id)} className={buttonClass({ variant: "danger", size: "sm" })}>
            {remove.isPending && <Spinner />}
            Delete {reference}
          </button>
          <button type="button" onClick={() => setAsking(false)} className={buttonClass({ variant: "ghost", size: "sm" })}>
            Keep
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setAsking(true)} className={buttonClass({ variant: "ghost", size: "sm" })}>
          <Trash2 aria-hidden />
          Delete
        </button>
      )}
    </div>
  );
}

/** The other rooms booked with this one under the same group reference. */
/** How the money came in (from the receipts), else the method the guest chose. */
function PaidByRow({ bookingId, chosen, number }: { bookingId: string; chosen: string; number: string | null }) {
  const receipts = useQuery(trpc.receipts.forBooking.queryOptions(bookingId));
  const methods = [...new Set((receipts.data ?? []).map((receipt) => receipt.methodLabel))];
  if (methods.length) return <Row label="Paid by">{methods.join(", ")}</Row>;
  return (
    <Row label="Will pay by">
      {paymentMethodNames[chosen] ?? chosen}
      {number ? ` · ${number}` : ""}
    </Row>
  );
}

/**
 * A group booking's money as one: every room with its own price, the group's
 * total, what has been paid and what is still owed. Shown before the room's
 * own figures, so nobody reads one room's price as the whole booking's.
 */
function GroupPanel({ groupRef, current }: { groupRef: string; current: string }) {
  const group = useQuery(trpc.bookings.group.queryOptions(groupRef));
  const rooms = (group.data ?? []).filter((room) => room.bookingStatus !== "cancelled");
  const cancelled = (group.data ?? []).length - rooms.length;
  const total = rooms.reduce((sum, room) => sum + room.totalAmount, 0);
  const paid = rooms.reduce((sum, room) => sum + room.amountPaid, 0);
  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          Group booking <span className="font-mono text-accent">{groupRef}</span>
        </h3>
        <span className="text-xs text-muted-foreground">
          {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
          {cancelled ? ` · ${cancelled} cancelled` : ""}
        </span>
      </div>
      {group.isPending && <Skeleton className="mt-2 h-16 w-full rounded-xl" />}
      <ul className="mt-2 divide-y divide-border/40">
        {(group.data ?? []).map((room) => {
          const chip = room.bookingStatus === "cancelled" ? { tone: "bad" as const, label: "Cancelled" } : paymentChip(room.paymentStatus);
          return (
            <li key={room.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${room.id === current ? "bg-accent/10" : ""}`}>
              <span className="min-w-0 truncate">
                {room.roomName} <span className="font-mono text-xs text-muted-foreground">{room.reference}</span>
                {room.id === current && <span className="ml-1.5 text-xs text-accent">this one</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={room.bookingStatus === "cancelled" ? "text-muted-foreground line-through" : ""}>{money(room.totalAmount)}</span>
                <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
              </span>
            </li>
          );
        })}
      </ul>
      <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-accent/30 pt-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Group total</dt>
          <dd className="font-display text-xl">{money(total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Paid</dt>
          <dd className="font-display text-xl">{money(paid)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Still owed</dt>
          <dd className={`font-display text-xl ${total - paid > 0 ? "text-accent" : ""}`}>{money(Math.max(0, total - paid))}</dd>
        </div>
      </dl>
    </section>
  );
}
