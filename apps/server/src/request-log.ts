/**
 * The request log line without its query string. tRPC puts a query's input in
 * the URL (`?input={"reference":...,"guestEmail":...}`), so the stock logger
 * would write guests' details into every log. The path still says which
 * procedure ran; status and timing are untouched.
 */
export function withoutQuery(line: string): string {
  return line.replace(/\?\S*/g, "?…");
}

/** Hono's logger print function, redacting query strings. */
export function printRequest(line: string, ...rest: string[]): void {
  console.log(withoutQuery(line), ...rest);
}
