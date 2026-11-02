import { registrationLayout, type RegistrationForLayout } from "@/lib/registration/registration-layout";

import { LetterheadView, SheetTitle, sheetLabel } from "./letterhead-view";

/** A guest registration card on the letterhead, on screen: the same layout as its PDF. */
export function RegistrationView({ card, className = "" }: { card: RegistrationForLayout; className?: string }) {
  const layout = registrationLayout(card);
  return (
    <LetterheadView from={layout.from} footerLine={layout.footerLine} footerName={layout.footerName} className={className}>
      <SheetTitle title="REGISTRATION" numberLabel="Card no." number={layout.number} />
      <div className="mt-6 space-y-4">
        {layout.sections.map((section) => (
          <section key={section.title} className="overflow-hidden rounded-xl border border-[#E3E8E5]">
            <h4 className="bg-[#0B2D26] px-3 py-1.5 text-[0.6rem] font-semibold tracking-[0.18em] text-white uppercase">{section.title}</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2.5 sm:grid-cols-3">
              {section.rows.map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="text-[0.65rem] text-[#7C8A85]">{key}</dt>
                  <dd className="truncate text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-[#F6F4EE] p-3 text-xs leading-relaxed text-[#4D5A55]">
        <span className="font-semibold text-[#111A17]">I agree to the following conditions: </span>
        {layout.conditions}
      </p>
      <div className="mt-5 grid grid-cols-2 items-end gap-6">
        <div>
          {layout.signature ? (
            // eslint-disable-next-line @next/next/no-img-element -- a drawn signature, a data URL
            <img src={layout.signature} alt="Guest's signature" className="h-14 max-w-full object-contain" />
          ) : (
            <div className="h-14" />
          )}
          <p className="border-t border-[#111A17]/40 pt-1 text-xs">Signature of guest · {layout.signedOn}</p>
        </div>
        <div>
          <p className={sheetLabel}>Receptionist</p>
          <p className="mt-1.5 border-t border-[#111A17]/40 pt-1 text-sm font-medium">{layout.receptionist}</p>
        </div>
      </div>
    </LetterheadView>
  );
}
