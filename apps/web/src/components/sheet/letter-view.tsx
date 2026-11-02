import { letterLayout, type LetterInputForLayout } from "@/lib/letter/letter-layout";

import { LetterheadView, sheetLabel } from "./letterhead-view";

/** A letter on the letterhead, on screen: the same layout as its PDF. */
export function LetterView({ letter, className = "" }: { letter: LetterInputForLayout; className?: string }) {
  const layout = letterLayout(letter);
  return (
    <LetterheadView from={layout.from} footerLine={layout.footerLine} footerName={layout.footerName} className={className}>
      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{layout.date}</p>
        <p className={sheetLabel}>Ref {layout.reference}</p>
      </div>
      <div className="mt-6 text-sm leading-relaxed">
        {layout.recipient.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <p className="mt-6 text-sm font-semibold tracking-wide">RE: {layout.subject.toUpperCase()}</p>
      <span aria-hidden className="mt-2 block h-0.5 w-10 bg-[#844F3E]" />
      {layout.paragraphs.length ? (
        layout.paragraphs.map((paragraph, index) => (
          <p key={index} className="mt-4 text-sm leading-relaxed whitespace-pre-line">
            {paragraph}
          </p>
        ))
      ) : (
        <p className="mt-4 text-sm text-[#7C8A85] italic">Your letter appears here as you type.</p>
      )}
      <p className="mt-8 text-sm">{layout.closing},</p>
      <div className="mt-8 w-52 border-t border-[#111A17]/40 pt-1.5 text-sm">
        <p className="font-semibold">{layout.signerName || "—"}</p>
        {layout.signerTitle && <p className="text-xs text-[#4D5A55]">{layout.signerTitle}</p>}
        <p className="text-xs text-[#4D5A55]">{letter.property.name}</p>
      </div>
    </LetterheadView>
  );
}
