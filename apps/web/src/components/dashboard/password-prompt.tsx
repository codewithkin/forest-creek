"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { answerPasswordPrompt, onPasswordPrompt } from "@/lib/password-prompt";
import { trpc } from "@/utils/trpc";

import { Modal } from "./ui/overlay";

const field =
  "mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";
const primary =
  "inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50";
const secondary = "inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:border-accent/50";

/**
 * Asked before anything is deleted: the password the person signs in with.
 * Right, and the delete goes ahead, with no asking again for a few minutes.
 * Mounted once in the dashboard shell; opened by the tRPC link.
 */
export function PasswordPrompt() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const formId = useId();
  const confirm = useMutation(trpc.security.confirmPassword.mutationOptions());

  useEffect(() => onPasswordPrompt(setOpen), []);
  useEffect(() => {
    if (!open) {
      setPassword("");
      setProblem(null);
    }
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) return setProblem("Enter your password.");
    confirm.mutate(
      { password },
      {
        onSuccess: () => answerPasswordPrompt(true),
        onError: (error) => setProblem(error.message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={() => answerPasswordPrompt(false)}
      size="sm"
      icon={<LockKeyhole className="size-4" />}
      title="Enter your password to delete"
      description="The password you sign in with. You won't be asked again for the next 5 minutes."
      footer={
        <>
          <button type="button" onClick={() => answerPasswordPrompt(false)} className={secondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={confirm.isPending} className={primary}>
            {confirm.isPending && <Loader2 className="size-4 animate-spin" />}
            Delete
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <label className="block text-sm font-medium">
          Password
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setProblem(null);
            }}
            className={field}
          />
        </label>
        {problem && <p className="mt-2 text-sm text-destructive">{problem}</p>}
      </form>
    </Modal>
  );
}
