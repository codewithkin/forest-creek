import { letterLayout, type LetterInputForLayout } from "@/lib/letter/letter-layout";

import { LetterheadView, sheetLabel, StampView } from "./letterhead-view";

/** A letter on the letterhead, on screen: the same layout as its PDF. */
export function LetterView({ letter, className = "" }: { letter: LetterInputForLayout; className?: string }) {
  const layout = letterLayout(letter);
  return (
    <LetterheadView from={layout.from} className={className}>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
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
      <p className="mt-8 font-display text-base text-[#0B3B3C]">{layout.closing},</p>
      <div className="flex items-end gap-1">
        <div className="w-52">
          {/* eslint-disable-next-line @next/next/no-img-element -- a drawn data URL */}
          {layout.signature ? <img src={layout.signature} alt={`${layout.signerName}'s signature`} className="mt-2 h-12 max-w-full object-contain" /> : <div className="h-10" />}
          <div className="mt-1 border-t border-[#0B3B3C] pt-1.5">
            <p className="font-display text-lg leading-tight font-semibold text-[#0B3B3C]">{layout.signerName || "—"}</p>
            {layout.signerTitle && <p className="text-[0.6rem] font-semibold tracking-[0.22em] text-[#B58D1E] uppercase">{layout.signerTitle}</p>}
            <p className="text-xs tracking-wider text-[#4D5A55]">{layout.propertyName}</p>
          </div>
        </div>
        {layout.stamped && <StampView className="size-20 shrink-0 sm:size-24" />}
      </div>
    </LetterheadView>
  );
}
