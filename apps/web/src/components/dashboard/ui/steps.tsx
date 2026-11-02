"use client";

import { ArrowLeft, Check } from "lucide-react";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";

import { Modal } from "./overlay";

/*
 * Every new task in the dashboard is four steps: start it, give the few
 * details only a person knows (the system works out the rest), choose what
 * happens, done. One component, so they all look and behave the same.
 */

export type StepDef = { key: string; label: string };

/** The numbered track under the title: done steps tick, the current one glows. */
export function Stepper({ steps, current }: { steps: readonly StepDef[]; current: number }) {
  return (
    <div className="border-b border-border/60 px-5 py-3">
      <ol className="flex items-center gap-2" aria-label="Progress">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step.key} className="flex min-w-0 flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-all duration-300 ${
                  done
                    ? "bg-accent text-accent-foreground"
                    : active
                      ? "bg-accent/15 text-accent ring-2 ring-accent"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {done ? <Check key="done" className="size-3.5 animate-pop-in" aria-hidden /> : index + 1}
              </span>
              <span className={`hidden truncate text-xs sm:block ${active ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
              {index < steps.length - 1 && (
                <span aria-hidden className="relative h-0.5 min-w-3 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-out"
                    style={{ width: done ? "100%" : "0%" }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground sm:hidden">
        Step {current + 1} of {steps.length}: {steps[current]?.label}
      </p>
    </div>
  );
}

/**
 * A modal that walks through steps. The caller owns the state and says what
 * Next does; this draws the track, the sliding content and the buttons.
 */
export function StepModal({
  title,
  description,
  icon,
  steps,
  current,
  onClose,
  onBack,
  next,
  size = "lg",
  children,
  aside,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  steps: readonly StepDef[];
  current: number;
  onClose: () => void;
  /** Absent on the first and last steps. */
  onBack?: () => void;
  /** The forward button for this step; absent on the last step. */
  next?: { label: string; onClick?: () => void; disabled?: boolean; pending?: boolean; form?: string; icon?: React.ReactNode };
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
  /** Left of the buttons: a running total, a hint. */
  aside?: React.ReactNode;
}) {
  const last = current === steps.length - 1;
  return (
    <Modal
      open
      onClose={onClose}
      size={size}
      icon={icon}
      title={title}
      description={description}
      subheader={<Stepper steps={steps} current={current} />}
      footer={
        last ? undefined : (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">{aside}</div>
            <div className="flex gap-2">
              {onBack ? (
                <button type="button" onClick={onBack} className={buttonClass({ variant: "ghost", shape: "pill" })}>
                  <ArrowLeft aria-hidden />
                  Back
                </button>
              ) : (
                <button type="button" onClick={onClose} className={buttonClass({ variant: "ghost", shape: "pill" })}>
                  Cancel
                </button>
              )}
              {next && (
                <button
                  type={next.form ? "submit" : "button"}
                  form={next.form}
                  onClick={next.onClick}
                  disabled={next.disabled || next.pending}
                  className={buttonClass({ shape: "pill" })}
                >
                  {next.pending ? <Spinner /> : next.icon}
                  {next.label}
                </button>
              )}
            </div>
          </div>
        )
      }
    >
      {/* Keyed by step, so each one slides in fresh. */}
      <div key={current} className="animate-rise-in">
        {children}
      </div>
    </Modal>
  );
}

/** The last step: a tick that pops in, what happened, and where to go next. */
export function DoneStep({ title, children, actions }: { title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <span className="relative flex size-16 items-center justify-center">
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent/25 [animation-iteration-count:2]" />
        <span className="relative flex size-16 animate-pop-in items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Check className="size-8" strokeWidth={2.5} aria-hidden />
        </span>
      </span>
      <h3 className="mt-5 font-display text-2xl">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-muted-foreground">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** A big choice card: a radio or checkbox that reads as a button. */
export function ChoiceCard({
  checked,
  onChange,
  title,
  hint,
  icon,
  type = "radio",
  name,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  type?: "radio" | "checkbox";
  name?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`group relative flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-sm transition-all duration-200 ${
        disabled
          ? "cursor-not-allowed border-border/40 opacity-50"
          : checked
            ? "border-accent bg-accent/10 shadow-[0_0_0_1px_var(--color-accent)]"
            : "border-border/60 hover:-translate-y-0.5 hover:border-accent/50"
      }`}
    >
      <input
        type={type}
        name={name}
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {icon && (
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            checked ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground group-hover:text-accent"
          }`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          checked ? "border-accent bg-accent text-accent-foreground" : "border-border"
        }`}
      >
        {checked && <Check className="size-3 animate-pop-in" strokeWidth={3} />}
      </span>
    </label>
  );
}
