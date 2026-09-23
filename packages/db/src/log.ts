/**
 * An error, described for a log line without the data it carries. Import-free
 * so it is unit tested and usable from any app.
 *
 * Handing an error object straight to console.error prints everything on it,
 * and the errors this system meets carry guests' details: a failed Prisma call
 * repeats its arguments (emails, message bodies) in the middle of its message,
 * and an AI provider error holds the whole request — the guest's conversation.
 * What a log needs is what failed and where: the type, a code, the first and
 * last lines of the message (Prisma's reason is on the last), and the stack
 * frames, which are file paths.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? clip(firstLine(error)) : "non-error value thrown";
  }

  const code = (error as { code?: unknown }).code;
  const status = (error as { statusCode?: unknown }).statusCode;
  const lines = error.message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  const last = lines.length > 1 ? lines[lines.length - 1]! : "";

  let summary = error.name;
  if (typeof code === "string" || typeof code === "number") summary += ` [${code}]`;
  if (typeof status === "number") summary += ` (HTTP ${status})`;
  summary += `: ${clip(first)}`;
  if (last && last !== first) summary += ` … ${clip(last)}`;

  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "))
    .slice(0, 6)
    .join("\n");
  return frames ? `${summary}\n${frames}` : summary;
}

function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim())?.trim() ?? "";
}

function clip(text: string, max = 240): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
