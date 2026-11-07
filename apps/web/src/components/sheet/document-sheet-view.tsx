import type { DocumentSheet } from "@/lib/sheet/document-sheet";

import { LetterheadView, SheetTitle, sheetLabel as label } from "./letterhead-view";

/* A quotation or invoice as paper, on screen: the same sheet as its PDF. */

export function DocumentSheetView({ sheet, className = "" }: { sheet: DocumentSheet; className?: string }) {
  return (
    <LetterheadView
      from={sheet.from}
      className={className}
      overlay={
        sheet.stamp && (
          <span
            aria-hidden
            className={`pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-12 rounded-xl border-4 px-6 py-1 font-display text-6xl font-semibold tracking-widest opacity-20 ${
              sheet.stamp === "VOID" ? "border-[#844F3E] text-[#844F3E]" : "border-[#2BA98A] text-[#2BA98A]"
            }`}
          >
            {sheet.stamp}
          </span>
        )
      }
    >
      <SheetTitle title={sheet.title} numberLabel={sheet.numberLabel} number={sheet.number} />

      <div className="mt-7 flex flex-wrap justify-between gap-4">
        <div>
          <p className={label}>{sheet.partyLabel}</p>
          <p className="mt-1.5 font-medium">{sheet.party}</p>
          {sheet.partyLine && <p className="text-xs text-[#4D5A55]">{sheet.partyLine}</p>}
        </div>
        <div className="ml-auto text-right">
          <p className={label}>{sheet.dateLabel}</p>
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
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                      {item.details.map(([key, value]) => (
                        <div key={`${key}${value}`} className="contents">
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
            {sheet.adjustments.map((row) => (
              <tr key={row.label} className="border-b border-[#E3E8E5]">
                <td colSpan={3} className="px-3 py-2.5 text-right text-[#4D5A55]">
                  {row.label}
                </td>
                <td className="px-3 py-2.5 text-right font-medium">{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-6 border-b border-[#E3E8E5] px-3 py-4">
        <span className="text-[0.65rem] font-semibold tracking-[0.24em] uppercase">{sheet.totalLabel}</span>
        <span className="font-display text-3xl font-semibold text-[#B58D1E]">{sheet.total}</span>
      </div>
      {sheet.after.map((row) => (
        <div key={row.label} className="flex justify-end gap-6 px-3 py-1.5 text-sm">
          <span className="text-[#4D5A55]">{row.label}</span>
          <span className="min-w-20 text-right font-medium">{row.amount}</span>
        </div>
      ))}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {sheet.info.map((block) => (
          <div key={block.label}>
            <p className={label}>{block.label}</p>
            {block.lines.map((line, index) => (
              <p key={line} className={`text-sm ${index === 0 ? "mt-1.5" : ""} ${block.lines.length > 1 && index === 0 ? "font-semibold" : ""}`}>
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
        <p className="flex items-baseline gap-3 text-sm">
          <span className={label}>Note</span>
          <span className="whitespace-pre-wrap">{sheet.note}</span>
        </p>
        {sheet.preparedBy && (
          <p className="ml-auto text-right text-sm">
            <span className={label}>Prepared by</span>
            <span className="mt-1 block border-t border-[#111A17]/40 pt-1 font-medium">{sheet.preparedBy}</span>
          </p>
        )}
      </div>
    </LetterheadView>
  );
}
