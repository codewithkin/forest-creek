"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

/**
 * What every overlay needs: Escape closes it, focus moves in and back out,
 * and the page behind stops scrolling.
 */
function useOverlay(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  return panel;
}

function OverlayHeader({
  titleId,
  title,
  description,
  icon,
  onClose,
}: {
  titleId: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/70 text-accent">{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="font-display text-xl leading-tight">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** A centred dialog, for one focused task. */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = "md",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = useOverlay(open, onClose);
  const titleId = useId();
  if (!open) return null;
  const width = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button type="button" aria-hidden tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/60" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-3xl border border-border/70 bg-popover outline-none sm:rounded-3xl ${width}`}
      >
        <OverlayHeader titleId={titleId} title={title} description={description} icon={icon} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** A side panel over the page, for the detail of a row. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panel = useOverlay(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-hidden tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/60" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-xl flex-col border-l border-border/70 bg-popover outline-none"
      >
        <OverlayHeader titleId={titleId} title={title} description={description} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
