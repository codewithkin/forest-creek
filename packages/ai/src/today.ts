/**
 * Import-free, so it can be unit tested without the validated environment.
 */

/** Today, YYYY-MM-DD, where the lodges are: "today" must not follow the server's clock. */
export function todayInHarare(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}
