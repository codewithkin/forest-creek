import { createHash } from "node:crypto";

/**
 * Working out WHY Paynow answered "Invalid Hash", from the start of the hash
 * it expected ("Hash should start with: DCC479"). Free of env and network, so
 * it is unit tested.
 *
 * Every request is signed: SHA-512 over the field values in order, then the
 * integration key, upper-case hex. Paynow's spec hashes the RAW values with
 * the key exactly as issued; the paynow SDK hashes URL-encoded values and
 * lower-cases the key. Recomputing the variants against Paynow's prefix tells
 * a wrong key apart from those two differences.
 */

/** SHA-512 over the values in order, then the key exactly as given (status-update's paynowHash lower-cases it). */
export function requestHash(values: Record<string, string>, key: string): string {
  const joined = Object.entries(values)
    .filter(([field]) => field.toLowerCase() !== "hash")
    .map(([, value]) => value)
    .join("");
  return createHash("sha512").update(joined + key, "utf8").digest("hex").toUpperCase();
}

/** The prefix in Paynow's "Invalid Hash. Hash should start with: DCC479", if that is the error. */
export function expectedHashPrefix(error: string): string | undefined {
  return /invalid hash[\s\S]*?start with:?\s*([0-9a-f]{4,})/i.exec(error)?.[1]?.toUpperCase();
}

export type HashVerdict = "key-case" | "encoding" | "wrong-key";

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * @param sent the fields exactly as the SDK sent them (URL-encoded, with its hash)
 * @param key the configured integration key
 */
export function diagnoseInvalidHash(
  sent: Record<string, string>,
  key: string,
  expectedPrefix: string,
): { verdict: HashVerdict; explanation: string } {
  const raw = Object.fromEntries(Object.entries(sent).map(([field, value]) => [field, decode(value)]));
  const matches = (values: Record<string, string>, candidate: string) =>
    requestHash(values, candidate).startsWith(expectedPrefix);

  if (matches(sent, key) && key !== key.toLowerCase()) {
    return {
      verdict: "key-case",
      explanation:
        "Paynow hashes with the integration key exactly as issued, but the paynow library lower-cases it and this key has capital letters.",
    };
  }
  if (matches(raw, key) || matches(raw, key.toLowerCase())) {
    return {
      verdict: "encoding",
      explanation:
        "Paynow hashed the raw field values; the paynow library hashed URL-encoded ones, and one of the values (reference, item title, email or URLs) has a character that encoding changes.",
    };
  }
  return {
    verdict: "wrong-key",
    explanation: `No form of PAYNOW_INTEGRATION_KEY produces Paynow's hash for integration ${sent.id ?? "?"}: the key is not that integration's key. In Paynow, open that integration (Receive Payment Links → Edit) and copy its Integration ID and Key together into the API server and the agent.`,
  };
}

/**
 * Refusals that mean our Paynow setup is wrong, not the guest's phone or
 * number. The guest cannot fix them, so they are told plainly and staff get
 * the details.
 */
export function isPaynowSetupError(error: string): boolean {
  return /invalid hash|invalid id|hash mismatch|integration (?:is )?(?:not|disabled|inactive)/i.test(error);
}
