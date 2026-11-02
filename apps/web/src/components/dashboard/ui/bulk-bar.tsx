"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Spinner } from "@/components/brand/spinner";

export type BulkAction = {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void | Promise<unknown>;
  /** Shown in red, and asks once more before running. */
  danger?: boolean;
  /** The question asked first, for an action that can't be undone. */
  confirm?: string;
  disabled?: boolean;
  /** Why it's disabled, as a tooltip. */
  hint?: string;
};

/**
 * What can be done with the rows ticked: rises from the bottom of the screen
 * once anything is selected, says how many, and clears in one click. A
 * dangerous action asks once more in place, so a slip costs nothing.
 */
export function BulkBar({ count, noun, actions, onClear }: { count: number; noun: [string, string]; actions: BulkAction[]; onClear: () => void }) {
  const [asking, setAsking] = useState<string>();
  const [running, setRunning] = useState<string>();
  if (count === 0) return null;

  async function run(action: BulkAction) {
    if (action.confirm && asking !== action.key) {
      setAsking(action.key);
      return;
    }
    setAsking(undefined);
    setRunning(action.key);
    try {
      await action.onClick();
    } finally {
      setRunning(undefined);
    }
  }

  const question = actions.find((action) => action.key === asking)?.confirm;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6 lg:pl-64">
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="pointer-events-auto flex max-w-full animate-modal-in flex-wrap items-center gap-1.5 rounded-3xl border border-accent/40 bg-popover/95 py-2 pr-2 pl-4 shadow-2xl backdrop-blur-md"
      >
        <span key={count} className="mr-1 inline-flex animate-pop-in items-center gap-2 text-sm font-medium">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{count}</span>
          {count === 1 ? noun[0] : noun[1]} selected
        </span>
        {question ? (
          <>
            <span className="px-1 text-sm text-rose-200">{question}</span>
            <button
              type="button"
              onClick={() => void run(actions.find((action) => action.key === asking)!)}
              className="rounded-full bg-destructive px-3 py-1.5 text-sm text-white hover:bg-destructive/90"
            >
              Yes
            </button>
            <button type="button" onClick={() => setAsking(undefined)} className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary">
              No
            </button>
          </>
        ) : (
          actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                title={action.disabled ? action.hint : undefined}
                disabled={action.disabled || Boolean(running)}
                onClick={() => void run(action)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
                  action.danger ? "text-rose-300 hover:bg-destructive/15" : "hover:bg-secondary"
                }`}
              >
                {running === action.key ? <Spinner /> : Icon && <Icon className="size-4" />}
                {action.label}
              </button>
            );
          })
        )}
        <button type="button" onClick={onClear} aria-label="Clear the selection" className="ml-1 rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
