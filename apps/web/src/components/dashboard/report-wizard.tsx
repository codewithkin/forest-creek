"use client";

import type { AppRouter } from "@forest-creek/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Mail, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { friendlyError, Skeleton } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { money, percent } from "./kpi";
import { downloadCsv } from "./ui/csv";
import { ChoiceCard, DoneStep, StepModal } from "./ui/steps";

type Report = inferRouterOutputs<AppRouter>["reports"]["get"];
export type ReportPeriod = "day" | "week" | "month";

const steps = [
  { key: "period", label: "Period" },
  { key: "which", label: "Which" },
  { key: "how", label: "How" },
  { key: "done", label: "Done" },
] as const;

const periodChoices = [
  { key: "day", label: "Daily", hint: "One day's money, bookings and movements", icon: Sun },
  { key: "week", label: "Weekly", hint: "Monday to Sunday", icon: CalendarRange },
  { key: "month", label: "Monthly", hint: "The whole calendar month", icon: CalendarDays },
] as const;

const DAY = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

type Stay = Report["arrivals"][number];

/** The report as a spreadsheet: headline figures, then properties, then the movements. */
export function downloadReportCsv(data: Report) {
  const { current } = data;
  const stays = (rows: Stay[], kind: string) =>
    rows.map((row) => [kind, row.reference, row.guestName, row.propertyName, row.roomName, String(row.checkIn).slice(0, 10), String(row.checkOut).slice(0, 10), row.guests, row.totalAmount, row.amountPaid]);
  downloadCsv(`forest-creek-report-${data.range.from}.csv`, [
    ["Forest Creek report", data.label],
    [],
    ["Money received", current.moneyReceived],
    ...current.byMethod.map((row) => [`  ${row.method}`, row.amount]),
    ["Refunds paid", current.refundsPaid],
    ["Revenue earned", Math.round(current.revenueEarned)],
    ["Occupancy", percent(current.occupancy, 1)],
    ["Average nightly rate", Math.round(current.adr)],
    ["RevPAR", Math.round(current.revpar)],
    ["Bookings made", current.bookingsMade],
    ["Cancellations", current.cancellations],
    ["Unpaid bookings (not income)", current.maybesMade],
    [],
    ["Property", "Occupancy", "ADR", "RevPAR", "Revenue"],
    ...data.properties.map((row) => [row.propertyName, percent(row.occupancy, 1), Math.round(row.adr), Math.round(row.revpar), Math.round(row.revenue)]),
    [],
    ["Movement", "Reference", "Guest", "Property", "Room", "Arrive", "Leave", "Guests", "Total", "Paid"],
    ...stays(data.arrivals, "Arrival"),
    ...stays(data.departures, "Departure"),
  ]);
}

/**
 * A report in four steps: which kind, which day/week/month (with its headline
 * figures), how to have it (PDF, spreadsheet, and emailed from now on), done.
 */
export function ReportWizard({
  propertyId,
  initialPeriod,
  initialDate,
  onClose,
}: {
  propertyId?: string;
  initialPeriod: ReportPeriod;
  initialDate: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod);
  const [date, setDate] = useState(initialDate);
  const [pdf, setPdf] = useState(true);
  const [csv, setCsv] = useState(false);
  const [email, setEmail] = useState<boolean>();

  const report = useQuery({ ...trpc.reports.get.queryOptions({ period, date, propertyId }), enabled: step >= 1 });
  const data = report.data;
  const subscriptions = useQuery(trpc.reports.subscriptions.queryOptions());
  const subscribed = subscriptions.data?.includes(period) ?? false;
  const wantsEmail = email ?? subscribed;
  const subscribe = useMutation(trpc.reports.setSubscription.mutationOptions());

  const finish = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error("The report hasn't loaded yet");
      if (wantsEmail !== subscribed) {
        await subscribe.mutateAsync({ period, on: wantsEmail });
        await queryClient.invalidateQueries({ queryKey: trpc.reports.subscriptions.queryKey() });
      }
      if (csv) downloadReportCsv(data);
      // The PDF answers as an attachment, so the dashboard stays put.
      if (pdf) window.location.assign(`/dashboard/reports/pdf?period=${period}&date=${date}${propertyId ? `&propertyId=${propertyId}` : ""}`);
    },
    onSuccess: () => setStep(3),
    onError: (error) => toast.error(friendlyError(error)),
  });

  const atLatest = Boolean(data && data.range.to > todayIso());
  const chosenLabel = periodChoices.find((choice) => choice.key === period)!.label.toLowerCase();
  const nothing = !pdf && !csv && wantsEmail === subscribed;

  const next =
    step === 0
      ? { label: "Next", onClick: () => setStep(1) }
      : step === 1
        ? { label: "Next", onClick: () => setStep(2), disabled: !data }
        : step === 2
          ? { label: pdf || csv ? "Download" : "Save", onClick: () => finish.mutate(), disabled: nothing || !data, pending: finish.isPending, icon: pdf || csv ? <Download aria-hidden /> : <Mail aria-hidden /> }
          : undefined;

  return (
    <StepModal
      title="Get a report"
      description="Pick the period; the figures are worked out from bookings and payments."
      icon={<FileText className="size-4" />}
      size="md"
      steps={steps}
      current={step}
      onClose={onClose}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
    >
      {step === 0 && (
        <div className="grid gap-2.5">
          {periodChoices.map((choice) => (
            <ChoiceCard
              key={choice.key}
              name="period"
              checked={period === choice.key}
              onChange={() => setPeriod(choice.key)}
              icon={<choice.icon className="size-4" />}
              title={choice.label}
              hint={choice.hint}
            />
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 p-2">
            <button
              type="button"
              aria-label="Earlier"
              disabled={!data}
              onClick={() => data && setDate(shift(data.range.from, -1))}
              className="rounded-full p-2.5 hover:bg-secondary disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span key={data?.label} className="animate-rise-in text-center font-display text-lg">
              {data?.label ?? "…"}
            </span>
            <button
              type="button"
              aria-label="Later"
              disabled={!data || atLatest}
              onClick={() => data && setDate(data.range.to)}
              className="rounded-full p-2.5 hover:bg-secondary disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          {report.isPending ? (
            <Skeleton className="h-24 w-full rounded-2xl" />
          ) : data ? (
            <dl key={data.label} className="grid animate-rise-in grid-cols-3 gap-2 text-center">
              {[
                ["Received", money(data.current.moneyReceived)],
                ["Earned", money(data.current.revenueEarned)],
                ["Occupancy", percent(data.current.occupancy, 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-secondary/50 px-2 py-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-display text-xl">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-rose-300">{report.error ? friendlyError(report.error) : ""}</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-2.5">
          <ChoiceCard type="checkbox" checked={pdf} onChange={setPdf} icon={<FileText className="size-4" />} title="PDF" hint="To read, print or forward" />
          <ChoiceCard type="checkbox" checked={csv} onChange={setCsv} icon={<FileSpreadsheet className="size-4" />} title="Spreadsheet (CSV)" hint="Opens in Excel or Sheets" />
          <ChoiceCard
            type="checkbox"
            checked={wantsEmail}
            onChange={setEmail}
            icon={<Mail className="size-4" />}
            title={`Email me the ${chosenLabel} report`}
            hint={subscribed ? "On: untick to stop the emails" : "Sent after 7am, from now on"}
          />
        </div>
      )}

      {step === 3 && (
        <DoneStep
          title={pdf || csv ? "Report downloading" : wantsEmail ? "Emails on" : "Emails off"}
          actions={
            <button type="button" onClick={onClose} className={buttonClass({ shape: "pill" })}>
              Done
            </button>
          }
        >
          {data?.label}
          {wantsEmail !== subscribed || email !== undefined
            ? wantsEmail
              ? `. You'll also get the ${chosenLabel} report by email.`
              : `. The ${chosenLabel} emails are off.`
            : "."}
        </DoneStep>
      )}
    </StepModal>
  );
}
