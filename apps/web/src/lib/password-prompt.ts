/**
 * The dashboard's "enter your password to delete" prompt, as a tiny store:
 * the tRPC link (utils/trpc.ts) asks when the API refuses a delete for want
 * of a password, and <PasswordPrompt /> answers. Every delete waiting at the
 * same moment (a bulk delete) shares one prompt.
 */
type Listener = (open: boolean) => void;

let pending: { promise: Promise<boolean>; resolve: (entered: boolean) => void } | null = null;
const listeners = new Set<Listener>();

/** Resolves true once the password was accepted, false if the person cancelled. */
export function askForPassword(): Promise<boolean> {
  if (!pending) {
    let resolve!: (entered: boolean) => void;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    pending = { promise, resolve };
    for (const listener of listeners) listener(true);
  }
  return pending.promise;
}

export function answerPasswordPrompt(entered: boolean) {
  const current = pending;
  pending = null;
  for (const listener of listeners) listener(false);
  current?.resolve(entered);
}

export function onPasswordPrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending !== null);
  return () => listeners.delete(listener);
}
