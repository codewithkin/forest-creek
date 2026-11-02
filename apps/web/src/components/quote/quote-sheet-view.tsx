import { quoteSheet, type QuoteSheetInput } from "@/lib/quote/quote-sheet";

/*
 * The quotation as paper, on screen: the same sheet as the PDF (quote-sheet.ts
 * lays out both). Light on purpose, in the dark dashboard too: it is the
 * document the guest receives.
 */

const label = "text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#7C8A85]";

export function QuoteSheetView({ quote, className = "" }: { quote: QuoteSheetInput; className?: string }) {
  const sheet = quoteSheet(quote);
  return (
    <article className={`overflow-hidden rounded-2xl bg-white text-[#111A17] shadow-xl ring-1 ring-white/20 ${className}`}>
      <div aria-hidden className="flex h-1.5">
        <span className="basis-[62%] bg-[#0B2D26]" />
        <span className="basis-[25%] bg-[#B58D1E]" />
        <span className="basis-[13%] bg-[#844F3E]" />
      </div>

      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static emblem */}
            <img src="/email/logo.png" alt="" className="size-10 rounded-full" />
            <div>
              <p className="font-display text-xl leading-none font-semibold tracking-wide text-[#0B2D26]">
                FOREST <span className="text-[#B58D1E]">CREEK</span>
              </p>
              <p className="mt-1 text-[0.5rem] tracking-[0.22em] text-[#4D5A55] uppercase">{sheet.footerLine}</p>
            </div>
          </div>
          <div className="ml-auto text-right">
            {sheet.from.lines.map((line) => (
              <p key={line} className="text-[0.65rem] tracking-[0.16em] text-[#4D5A55] uppercase">
                {line}
              </p>
            ))}
            <p className="mt-0.5 text-xs font-semibold">{sheet.from.phone}</p>
          </div>
        </header>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-4xl leading-none font-semibold tracking-wide sm:text-5xl">QUOTATION</h3>
            <span aria-hidden className="mt-4 block h-1 w-10 bg-[#844F3E]" />
          </div>
          <div className="ml-auto text-right">
            <p className={label}>Quotation no.</p>
            <p className="mt-1 font-semibold tracking-wide">{sheet.number}</p>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap justify-between gap-4">
          <div>
            <p className={label}>Prepared for</p>
            <p className="mt-1.5 font-medium">{sheet.billedTo}</p>
            {sheet.billedToLine && <p className="text-xs text-[#4D5A55]">{sheet.billedToLine}</p>}
          </div>
          <div className="ml-auto text-right">
            <p className={label}>Date</p>
            <p className="mt-1.5 font-medium">{sheet.date}</p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="bg-[#0B2D26] text-left text-[0.6rem] tracking-[0.18em] text-white uppercase">
                <th className="px-3 py-2.5 font-semibold">Item</th>
                <th className="px-2 py-2.5 text-center font-semibold">Qty</th>
                <th className="px-2 py-2.5 text-right font-semibold">Price</th>
                <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sheet.items.map((item) => (
                <tr key={item.id} className="border-b border-[#E3E8E5] align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold">{item.title}</p>
                    {item.details.length > 0 && (
                      <dl className="mt-1.5 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
                        {item.details.map(([key, value]) => (
                          <div key={key} className="contents">
                            <dt className="text-[#7C8A85]">{key}</dt>
                            <dd className="font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </td>
                  <td className="px-2 py-3 text-center font-medium whitespace-nowrap">{item.qty}</td>
                  <td className="px-2 py-3 text-right font-medium">{item.price}</td>
                  <td className="px-3 py-3 text-right font-medium">{item.amount}</td>
                </tr>
              ))}
              {sheet.discount && (
                <tr className="border-b border-[#E3E8E5]">
                  <td colSpan={3} className="px-3 py-2.5 text-right text-[#4D5A55]">
                    {sheet.discount.label}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{sheet.discount.amount}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-6 border-b border-[#E3E8E5] px-3 py-4">
          <span className="text-[0.65rem] font-semibold tracking-[0.24em] uppercase">Total (USD)</span>
          <span className="font-display text-3xl font-semibold text-[#B58D1E]">{sheet.total}</span>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <p className={label}>Payment</p>
            <p className="mt-1.5 text-sm">{sheet.payment}</p>
          </div>
          <div>
            <p className={label}>Valid until</p>
            <p className="mt-1.5 text-sm font-semibold">{sheet.validUntil}</p>
            <p className="text-sm">{sheet.accept}</p>
          </div>
        </div>

        <p className="mt-8 flex items-baseline gap-3 text-sm">
          <span className={label}>Note</span>
          <span className="whitespace-pre-wrap">{sheet.note}</span>
        </p>

        <footer className="mt-6 flex flex-wrap justify-between gap-2 border-t border-[#E3E8E5] pt-3">
          <span className="text-[0.6rem] font-semibold tracking-[0.26em] text-[#B58D1E] uppercase">{sheet.footerLine}</span>
          <span className="text-[0.65rem] text-[#7C8A85]">{sheet.footerName}</span>
        </footer>
      </div>
    </article>
  );
}
