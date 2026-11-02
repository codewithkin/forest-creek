"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mail, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { friendlyError } from "@/components/brand/state";
import { LetterView } from "@/components/sheet/letter-view";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import { useProperties } from "./property-context";
import { DoneStep, StepModal } from "./ui/steps";

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const steps = [
  { key: "to", label: "To" },
  { key: "write", label: "Write" },
  { key: "sign", label: "Sign-off" },
  { key: "done", label: "Done" },
] as const;

const closings = ["Yours faithfully", "Yours sincerely", "Kind regards", "With thanks"] as const;

/** Somewhere to start: the words in [brackets] are for staff to fill in. */
function starters(property: string) {
  return [
    { key: "blank", label: "Blank", subject: "", body: "" },
    {
      key: "confirm",
      label: "Confirmation of booking",
      subject: "Confirmation of booking",
      body: `Dear [Name],\n\nThis letter confirms that [Name] has a reservation at ${property} from [arrival date] to [departure date], [number] nights in the [room].\n\nShould you need anything further, please contact us on the details above.`,
    },
    {
      key: "proof",
      label: "Proof of stay",
      subject: "Proof of stay",
      body: `To whom it may concern,\n\nThis is to confirm that [Name] stayed at ${property} from [arrival date] to [departure date].\n\nPlease contact us on the details above should you require any further information.`,
    },
    {
      key: "thanks",
      label: "Thank you",
      subject: "Thank you for staying with us",
      body: `Dear [Name],\n\nThank you for choosing ${property}. It was a pleasure to have you with us, and we hope you enjoyed your time in the Vumba.\n\nWe would be delighted to welcome you back.`,
    },
  ];
}

/**
 * A letter in four steps: who it is to, the words, the sign-off with the
 * letter laid out on the letterhead, done. Staff type only the text; the
 * letterhead, date, reference and layout are the lodge's.
 */
export function LetterBuilder({ editId, onClose, onSaved }: { editId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { selectedId, properties } = useProperties();
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const existing = useQuery({ ...trpc.letters.byId.queryOptions(editId ?? ""), enabled: Boolean(editId) });
  const mine = useQuery(trpc.properties.mine.queryOptions());

  const [step, setStep] = useState(0);
  const [propertyId, setPropertyId] = useState(selectedId ?? properties[0]?.id ?? "");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [letterDate, setLetterDate] = useState(todayIso());
  const [body, setBody] = useState("");
  const [closing, setClosing] = useState<string>("Yours faithfully");
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");

  useEffect(() => {
    if (!signerName && session?.user.name) setSignerName(session.user.name);
  }, [session?.user.name, signerName]);

  const loaded = existing.data;
  useEffect(() => {
    if (!loaded) return;
    setPropertyId(loaded.propertyId);
    setRecipient(loaded.recipient);
    setSubject(loaded.subject);
    setLetterDate(loaded.letterDate);
    setBody(loaded.body);
    setClosing(loaded.closing);
    setSignerName(loaded.signerName);
    setSignerTitle(loaded.signerTitle ?? "");
  }, [loaded]);

  const property = mine.data?.find((candidate) => candidate.id === propertyId);
  const options = {
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.letters.pathKey() });
      setStep(3);
    },
    onError: (error: { message?: string }) => toast.error(friendlyError(error)),
  };
  const create = useMutation(trpc.letters.create.mutationOptions(options));
  const update = useMutation(trpc.letters.update.mutationOptions(options));
  const saved = create.data ?? update.data;

  function save() {
    const letter = { propertyId, recipient, subject, body, closing, signerName, signerTitle: signerTitle || undefined, letterDate };
    if (editId) update.mutate({ id: editId, letter });
    else create.mutate(letter);
  }

  const preview = property
    ? {
        label: loaded?.label ?? "Numbered when saved",
        recipient,
        subject,
        body,
        closing,
        signerName,
        signerTitle: signerTitle || null,
        letterDate,
        property: { name: property.name, location: property.location, phone: property.phone, email: property.email },
      }
    : undefined;

  const next =
    step === 0
      ? { label: "Next", form: "letter-to", disabled: !recipient.trim() || !subject.trim() }
      : step === 1
        ? { label: "Next", onClick: () => setStep(2), disabled: !body.trim() }
        : step === 2
          ? { label: editId ? "Save changes" : "Save letter", onClick: save, disabled: !signerName.trim(), pending: create.isPending || update.isPending, icon: <Save aria-hidden /> }
          : undefined;

  return (
    <StepModal
      title={editId ? "Edit letter" : "New letter"}
      description="Type the words; the letterhead and layout are done for you."
      icon={<Mail className="size-4" />}
      steps={steps}
      current={step}
      size={step >= 1 && step < 3 ? "xl" : "lg"}
      onClose={() => (step === 3 && saved ? onSaved(saved.id) : onClose())}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
    >
      {step === 0 && (
        <form
          id="letter-to"
          onSubmit={(event) => {
            event.preventDefault();
            if (recipient.trim() && subject.trim()) setStep(1);
          }}
          className="space-y-4"
        >
          {properties.length > 1 && (
            <label className="block text-xs">
              From
              <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={inputClass}>
                {properties.map((candidate) => (
                  <option key={candidate.id} value={candidate.id} className="bg-popover">
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <p className="text-xs">Start from</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {starters(property?.name ?? "Forest Creek").map((starter) => (
                <button
                  key={starter.key}
                  type="button"
                  onClick={() => {
                    setSubject(starter.subject);
                    setBody(starter.body);
                    if (starter.key === "proof" && !recipient) setRecipient("To whom it may concern");
                  }}
                  className="rounded-full bg-secondary px-3 py-1.5 text-sm text-muted-foreground transition-all hover:text-foreground active:scale-95"
                >
                  {starter.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-xs">
            To <span className="text-muted-foreground">(name and address, one line each)</span>
            <textarea required autoFocus rows={3} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={"Mr T. Moyo\n12 Main Street\nMutare"} className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
            <label className="text-xs">
              Subject
              <input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Confirmation of booking" className={inputClass} />
            </label>
            <label className="text-xs">
              Date
              <input type="date" value={letterDate} onChange={(event) => setLetterDate(event.target.value)} className={inputClass} />
            </label>
          </div>
        </form>
      )}

      {step === 1 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <label className="block text-xs">
            The letter <span className="text-muted-foreground">(leave a blank line between paragraphs)</span>
            <textarea autoFocus rows={18} value={body} onChange={(event) => setBody(event.target.value)} className={`${inputClass} leading-relaxed`} />
          </label>
          {preview && <LetterView letter={preview} className="hidden max-h-[32rem] overflow-y-auto lg:block" />}
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
          <div className="space-y-4">
            <div>
              <p className="text-xs">Closing</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {closings.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={closing === choice}
                    onClick={() => setClosing(choice)}
                    className={`rounded-full px-3 py-1.5 text-sm transition-colors ${closing === choice ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-xs">
              Signed by
              <input value={signerName} onChange={(event) => setSignerName(event.target.value)} className={inputClass} />
            </label>
            <label className="block text-xs">
              Title <span className="text-muted-foreground">(optional)</span>
              <input value={signerTitle} onChange={(event) => setSignerTitle(event.target.value)} placeholder="Reservations Manager" className={inputClass} />
            </label>
          </div>
          {preview && <LetterView letter={preview} className="min-w-0 animate-modal-in" />}
        </div>
      )}

      {step === 3 && saved && (
        <DoneStep
          title={editId ? "Letter saved" : "Letter ready"}
          actions={
            <>
              <a href={`/dashboard/letters/${saved.id}/pdf`} className={buttonClass({ shape: "pill" })}>
                <Download aria-hidden />
                Download PDF
              </a>
              <button type="button" onClick={() => onSaved(saved.id)} className={buttonClass({ variant: "secondary", shape: "pill" })}>
                Done
              </button>
            </>
          }
        >
          &ldquo;{subject}&rdquo; on the {property?.name} letterhead, ready to print, sign or send.
        </DoneStep>
      )}
    </StepModal>
  );
}
