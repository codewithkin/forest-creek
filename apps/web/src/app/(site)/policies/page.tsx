import type { Metadata, Route } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/brand/button";
import SplitWords from "@/components/motion/split-words";
import { reveal, stagger } from "@/components/motion/reveal";
import { api } from "@/lib/api";
import { lodge, telHref } from "@/lib/lodge";

// The figures come from the API, i.e. from the same rules the server applies.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Booking & Cancellation Policy — Forest Creek",
  description:
    "Deposits, balances, cancellation fees by season, date changes and refunds at Forest Creek Lodge.",
};

type Tier = { minDays: number; feePercent: number };

/** "More than 30 days", "15–30 days", "Less than 7 days / no-show". */
function tierLabels(tiers: Tier[]): string[] {
  return tiers.map((tier, index) => {
    const previous = tiers[index - 1];
    if (index === 0) return `More than ${tier.minDays - 1} days before arrival`;
    if (tier.minDays === 0) return `Less than ${previous!.minDays} days, or a no-show`;
    return `${tier.minDays}–${previous!.minDays - 1} days before arrival`;
  });
}

function TierTable({ tiers }: { tiers: Tier[] }) {
  const labels = tierLabels(tiers);
  return (
    <table className="mt-4 w-full text-sm">
      <thead>
        <tr className="border-b border-border/70 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <th className="py-2 pr-4 font-normal">Cancelled</th>
          <th className="py-2 pr-4 font-normal">Fee</th>
          <th className="py-2 font-normal">Refunded</th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((tier, index) => (
          <tr key={tier.minDays} className="border-b border-border/40">
            <td className="py-2.5 pr-4">{labels[index]}</td>
            <td className="py-2.5 pr-4">{tier.feePercent}%</td>
            <td className="py-2.5">{tier.feePercent === 100 ? "No refund" : `${100 - tier.feePercent}%`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ n, title, children, index }: { n: number; title: string; children: React.ReactNode; index: number }) {
  return (
    <section {...reveal("up", stagger(index))} className="rounded-2xl border border-border/70 bg-card p-6 sm:p-8">
      <h2 className="flex items-baseline gap-3 font-display text-2xl font-light">
        <span className="font-mono text-sm text-accent">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="mt-4 space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default async function PoliciesPage() {
  const terms = await api.policy.terms.query();
  const effective = new Date(terms.effectiveDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-5 pt-14 pb-24 sm:pt-20">
      <span className="text-xs tracking-[0.2em] text-accent uppercase">Forest Creek Lodge</span>
      <h1 className="mt-4 font-display text-4xl leading-[1.05] font-light sm:text-5xl">
        <SplitWords text="Booking & Cancellation Policy" />
      </h1>
      <p className="mt-4 animate-fade-up text-sm text-muted-foreground" style={{ animationDelay: "350ms" }}>
        Effective {effective}. All rates are quoted in US dollars.
      </p>

      <div className="mt-12 space-y-6">
        <Section n={1} title="Booking confirmation & payment" index={0}>
          <p>
            Every reservation needs a {terms.depositPercent}%
            {terms.depositNonRefundable ? " non-refundable" : ""} deposit to secure it. Your booking
            is confirmed once the deposit is received, and we email you to say so.
          </p>
          <p>
            The balance is due {terms.balanceDueDays} days before arrival ({terms.groupBalanceDueDays}{" "}
            days for groups of five or more rooms, or exclusive use). If you book within{" "}
            {terms.fullPaymentWithinDays} days of arrival, the full amount is due when you book.
          </p>
          <p>
            Pay online by EcoCash, OneMoney, InnBucks or Visa/Mastercard through Paynow, or by bank
            transfer or USD cash arranged with our reservations team.
          </p>
        </Section>

        <Section n={2} title="Low & shoulder season" index={1}>
          <p>January to May, and November.</p>
          <TierTable tiers={terms.tiers.low} />
        </Section>

        <Section n={3} title="High season — strict" index={2}>
          <p>June to October, and 15 December to 5 January.</p>
          <TierTable tiers={terms.tiers.high} />
          <p>
            High-season date changes are not permitted within {terms.highSeasonChangeFreezeDays}{" "}
            days of arrival and are treated as a cancellation.
          </p>
        </Section>

        <Section n={4} title="Amendments & early departure" index={3}>
          <p>
            One free date change is permitted if requested more than {terms.freeDateChangeMinDays}{" "}
            days before arrival (low season only), subject to availability and seasonal rate
            differences.
          </p>
          <p>Early check-outs and no-shows are not eligible for a refund for unused nights.</p>
        </Section>

        <Section n={5} title="Refunds" index={4}>
          <p>
            Refunds are processed within {terms.refundBusinessDays} business days to the original
            payment method, less a {terms.refundProcessingFeePercent}% bank processing fee.
          </p>
          <p>
            Instead of a refund, we can offer a free postponement within{" "}
            {terms.creditValidityMonths} months or a {terms.creditValidityMonths}-month credit
            voucher.
          </p>
        </Section>
      </div>

      <div {...reveal("up", 200)} className="mt-12 rounded-2xl bg-secondary/50 p-6 text-sm sm:p-8">
        <p className="font-display text-xl">To cancel or change a booking</p>
        <p className="mt-2 text-muted-foreground">
          Email{" "}
          <a href={`mailto:${lodge.email}`} className="text-accent underline underline-offset-4">
            {lodge.email}
          </a>{" "}
          or WhatsApp{" "}
          <a href={telHref(lodge.whatsapp)} className="text-accent underline underline-offset-4">
            {lodge.whatsapp}
          </a>{" "}
          with your booking reference.
        </p>
        <Link href={"/book" as Route} className={buttonClass({ shape: "pill", className: "mt-6" })}>
          Book your stay
        </Link>
      </div>
    </div>
  );
}
