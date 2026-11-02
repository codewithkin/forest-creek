/*
 * The letterhead on screen, as the PDFs have it (lib/sheet/letterhead-pdf.tsx):
 * stripes, emblem and wordmark, the property's address and contacts, the
 * footer line. Light on purpose, in the dark dashboard too: it is paper.
 */

export const sheetLabel = "text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#7C8A85]";

export function LetterheadView({
  from,
  footerLine,
  footerName,
  overlay,
  className = "",
  children,
}: {
  from: { lines: string[]; phone: string; email?: string };
  footerLine: string;
  footerName: string;
  overlay?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`relative overflow-hidden rounded-2xl bg-white text-[#111A17] shadow-xl ring-1 ring-white/20 ${className}`}>
      <div aria-hidden className="flex h-1.5">
        <span className="basis-[62%] bg-[#0B2D26]" />
        <span className="basis-[25%] bg-[#B58D1E]" />
        <span className="basis-[13%] bg-[#844F3E]" />
      </div>
      {overlay}
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static emblem */}
            <img src="/email/logo.png" alt="" className="size-10 rounded-full" />
            <div>
              <p className="font-display text-xl leading-none font-semibold tracking-wide text-[#0B2D26]">
                FOREST <span className="text-[#B58D1E]">CREEK</span>
              </p>
              <p className="mt-1 text-[0.5rem] tracking-[0.22em] text-[#4D5A55] uppercase">{footerLine}</p>
            </div>
          </div>
          <div className="ml-auto text-right">
            {from.lines.map((line) => (
              <p key={line} className="text-[0.65rem] tracking-[0.16em] text-[#4D5A55] uppercase">
                {line}
              </p>
            ))}
            <p className="mt-0.5 text-xs font-semibold">{from.phone}</p>
            {from.email && <p className="text-xs text-[#4D5A55]">{from.email}</p>}
          </div>
        </header>

        {children}

        <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t border-[#E3E8E5] pt-3">
          <span className="text-[0.6rem] font-semibold tracking-[0.26em] text-[#B58D1E] uppercase">{footerLine}</span>
          <span className="text-[0.65rem] text-[#7C8A85]">{footerName}</span>
        </footer>
      </div>
    </article>
  );
}

/** The big title with its short underline, and a number on the right. */
export function SheetTitle({ title, numberLabel, number }: { title: string; numberLabel: string; number: string }) {
  return (
    <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 className="font-display text-4xl leading-none font-semibold tracking-wide sm:text-5xl">{title}</h3>
        <span aria-hidden className="mt-4 block h-1 w-10 bg-[#844F3E]" />
      </div>
      <div className="ml-auto text-right">
        <p className={sheetLabel}>{numberLabel}</p>
        <p className="mt-1 font-semibold tracking-wide">{number}</p>
      </div>
    </div>
  );
}
