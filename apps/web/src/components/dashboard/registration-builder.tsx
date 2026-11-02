"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardSignature, Download, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { countNights, todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";
import { SignaturePad } from "./ui/signature-pad";
import { DoneStep, StepModal } from "./ui/steps";

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const steps = [
  { key: "guest", label: "Guest" },
  { key: "stay", label: "Contact & stay" },
  { key: "sign", label: "Sign" },
  { key: "done", label: "Done" },
] as const;

const methods = [
  { key: "cash", label: "Cash" },
  { key: "bank transfer", label: "Bank transfer" },
  { key: "ecocash", label: "EcoCash" },
  { key: "card", label: "Card" },
  { key: "other", label: "Other" },
] as const;

type Method = (typeof methods)[number]["key"];

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The front desk's registration card in four steps: who is staying, how to
 * reach them and the stay (filled from the booking when there is one), the
 * guest signs on the screen, done. Hand the tablet over at step three.
 */
export function RegistrationBuilder({ bookingId, onClose, onSaved }: { bookingId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { selectedId, properties } = useProperties();
  const queryClient = useQueryClient();
  const fromBooking = useQuery({ ...trpc.registrations.forBooking.queryOptions(bookingId ?? ""), enabled: Boolean(bookingId) });

  const [step, setStep] = useState(0);
  const [propertyId, setPropertyId] = useState(selectedId ?? properties[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [childrenAges, setChildrenAges] = useState("");
  const [nationality, setNationality] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [showAddress, setShowAddress] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [phoneWork, setPhoneWork] = useState("");
  const [carRegistration, setCarRegistration] = useState("");
  const [roomName, setRoomName] = useState("");
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(addDays(todayIso(), 1));
  const [receiptNumber, setReceiptNumber] = useState("");
  const [method, setMethod] = useState<Method>();
  const [signature, setSignature] = useState<string>();

  const draft = fromBooking.data?.draft;
  useEffect(() => {
    if (!draft) return;
    setPropertyId(draft.propertyId);
    setGuestName(draft.guestName);
    setAdults(String(draft.adults));
    setEmail(draft.email);
    setPhone(draft.phone ?? "");
    setRoomName(draft.roomName);
    setCheckIn(draft.checkIn);
    setCheckOut(draft.checkOut);
    setReceiptNumber(draft.receiptNumber ?? "");
    setMethod(draft.paymentMethod);
  }, [draft]);

  const conditions = useQuery(trpc.registrations.conditions.queryOptions());
  const rooms = useQuery({ ...trpc.properties.rooms.queryOptions({ propertyId }), enabled: Boolean(propertyId) && !bookingId });
  const nights = countNights(checkIn, checkOut);

  const save = useMutation(
    trpc.registrations.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.registrations.pathKey() });
        setStep(3);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const guestReady = Boolean(guestName.trim()) && Number(adults) >= 1;
  const stayReady = Boolean(roomName.trim()) && nights > 0;

  function submit() {
    save.mutate({
      propertyId,
      bookingId: draft?.bookingId,
      guestName,
      adults: Number(adults),
      children: Number(children) || 0,
      childrenAges: childrenAges || undefined,
      nationality: nationality || undefined,
      idNumber: idNumber || undefined,
      passportNumber: passportNumber || undefined,
      address: address || undefined,
      city: city || undefined,
      country: country || undefined,
      phone: phone || undefined,
      phoneWork: phoneWork || undefined,
      email: email || undefined,
      carRegistration: carRegistration || undefined,
      roomName,
      checkIn,
      checkOut,
      receiptNumber: receiptNumber || undefined,
      paymentMethod: method,
      signature,
    });
  }

  const next =
    step === 0
      ? { label: "Next", form: "registration-guest", disabled: !guestReady }
      : step === 1
        ? { label: "Next: guest signs", onClick: () => setStep(2), disabled: !stayReady }
        : step === 2
          ? { label: signature ? "Save card" : "Save without signature", onClick: submit, pending: save.isPending, icon: <ClipboardSignature aria-hidden /> }
          : undefined;

  return (
    <StepModal
      title="Guest registration"
      description={step === 2 ? "Hand the screen to the guest to read and sign." : "The registration card, without the paper."}
      icon={<ClipboardSignature className="size-4" />}
      steps={steps}
      current={step}
      onClose={() => (step === 3 && save.data ? onSaved(save.data.id) : onClose())}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
      aside={step >= 1 && nights > 0 ? <span className="text-sm text-muted-foreground">{nights} {nights === 1 ? "night" : "nights"}</span> : undefined}
    >
      {step === 0 && (
        <form
          id="registration-guest"
          onSubmit={(event) => {
            event.preventDefault();
            if (guestReady) setStep(1);
          }}
          className="space-y-4"
        >
          {!bookingId && properties.length > 1 && (
            <label className="block text-xs">
              Property
              <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={inputClass}>
                {properties.map((property) => (
                  <option key={property.id} value={property.id} className="bg-popover">
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs">
            Name
            <input required autoFocus value={guestName} onChange={(event) => setGuestName(event.target.value)} className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs">
              Adults
              <input required type="number" min={1} value={adults} onChange={(event) => setAdults(event.target.value)} className={inputClass} />
            </label>
            <label className="text-xs">
              Children
              <input type="number" min={0} value={children} onChange={(event) => setChildren(event.target.value)} className={inputClass} />
            </label>
            {Number(children) > 0 && (
              <label className="animate-rise-in text-xs">
                Their ages
                <input value={childrenAges} onChange={(event) => setChildrenAges(event.target.value)} placeholder="4, 7" className={inputClass} />
              </label>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs">
              Nationality
              <input value={nationality} onChange={(event) => setNationality(event.target.value)} className={inputClass} />
            </label>
            <label className="text-xs">
              ID no.
              <input value={idNumber} onChange={(event) => setIdNumber(event.target.value)} autoComplete="off" className={inputClass} />
            </label>
            <label className="text-xs">
              Passport no.
              <input value={passportNumber} onChange={(event) => setPassportNumber(event.target.value)} autoComplete="off" className={inputClass} />
            </label>
          </div>
        </form>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs">
              Cell
              <input value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} />
            </label>
            <label className="text-xs">
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
            </label>
            <label className="text-xs">
              Car registration
              <input value={carRegistration} onChange={(event) => setCarRegistration(event.target.value.toUpperCase())} placeholder="AGQ 9451" className={inputClass} />
            </label>
            <label className="text-xs">
              Receipt no.
              <input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} className={inputClass} />
            </label>
          </div>
          {showAddress ? (
            <div className="grid animate-rise-in gap-4 sm:grid-cols-2">
              <label className="text-xs sm:col-span-2">
                Address
                <input value={address} onChange={(event) => setAddress(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                City
                <input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                Country
                <input value={country} onChange={(event) => setCountry(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                Work phone
                <input value={phoneWork} onChange={(event) => setPhoneWork(event.target.value)} className={inputClass} />
              </label>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAddress(true)} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <Plus className="size-3.5" aria-hidden />
              Address and work phone
            </button>
          )}
          <div className="grid gap-4 rounded-2xl border border-border/60 p-4 sm:grid-cols-3">
            <label className="text-xs">
              Room
              {bookingId ? (
                <input value={roomName} readOnly className={`${inputClass} opacity-80`} />
              ) : (
                <select value={roomName} onChange={(event) => setRoomName(event.target.value)} className={inputClass}>
                  <option value="" disabled>
                    Choose
                  </option>
                  {rooms.data?.filter((room) => room.active).map((room) => (
                    <option key={room.id} value={room.name} className="bg-popover">
                      {room.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="text-xs">
              Check in
              <input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className={inputClass} />
            </label>
            <label className="text-xs">
              Check out
              <input type="date" min={addDays(checkIn, 1)} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className={inputClass} />
            </label>
          </div>
          <div>
            <p className="text-xs">Paying by</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {methods.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  aria-pressed={method === choice.key}
                  onClick={() => setMethod(method === choice.key ? undefined : choice.key)}
                  className={`rounded-full px-3 py-1.5 text-sm transition-all active:scale-95 ${method === choice.key ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-secondary/50 px-4 py-3 text-sm">
            <p className="font-medium">
              {guestName} · {roomName} · {nights} {nights === 1 ? "night" : "nights"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">I agree to the following conditions: </span>
              {conditions.data ?? "…"}
            </p>
          </div>
          <SignaturePad onChange={setSignature} />
        </div>
      )}

      {step === 3 && save.data && (
        <DoneStep
          title="Card saved"
          actions={
            <>
              <a href={`/dashboard/registrations/${save.data.id}/pdf`} className={buttonClass({ variant: "secondary", shape: "pill" })}>
                <Download aria-hidden />
                PDF
              </a>
              <button type="button" onClick={() => onSaved(save.data!.id)} className={buttonClass({ shape: "pill" })}>
                Done
              </button>
            </>
          }
        >
          {guestName} is registered{signature ? " and has signed" : ", without a signature"}.
        </DoneStep>
      )}
    </StepModal>
  );
}
