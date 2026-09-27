/**
 * fetch for the web app's own server talking to the API. Import-free, so it is
 * unit tested with a fake fetch.
 *
 * Found in production: the web container intermittently failed to resolve the
 * API's public name (getaddrinfo ENOTFOUND api.forestcreek.co.zw) and every
 * page that reads the API crashed. So a request is tried against each API base
 * in turn — the internal SERVER_URL first, the public URL after — and a brief
 * network failure is retried with a short backoff before a page gives up.
 */

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** The request never reached the API: resending it, even a mutation, cannot double anything. */
const NEVER_ARRIVED = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);
/** It may have arrived: only a read is safe to resend. */
const MAYBE_ARRIVED = new Set(["ECONNRESET", "ETIMEDOUT", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CLOSED"]);

/** The network error code, from wherever undici put it in the cause chain. */
export function networkErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function resilientFetch(options: {
  /** API bases in order of preference; the request URL starts with the first. */
  bases: string[];
  fetch?: Fetch;
  attempts?: number;
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Fetch {
  const bases = [...new Set(options.bases.filter(Boolean).map(trimSlash))];
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const attempts = options.attempts ?? 4;
  const backoffMs = options.backoffMs ?? 150;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  return async (input, init) => {
    // tRPC passes a string, better-auth a URL. A Request carries its own body
    // stream, which cannot be sent twice, so it goes out once as it is.
    if (input instanceof Request) return doFetch(input, init);
    const url = String(input);
    const base = bases.find((candidate) => url.startsWith(candidate));
    // Not one of ours (or nothing to fall back to): plain fetch.
    if (!base) return doFetch(input, init);
    const rest = url.slice(base.length);
    const read = (init?.method ?? "GET").toUpperCase() === "GET";

    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt++) {
      // Alternate bases, so one bad name (or one bad SERVER_URL) never decides the page.
      const target = bases[(bases.indexOf(base) + attempt) % bases.length]! + rest;
      try {
        return await doFetch(target, init);
      } catch (error) {
        const code = networkErrorCode(error);
        const safe = (code && NEVER_ARRIVED.has(code)) || (read && code && MAYBE_ARRIVED.has(code));
        if (!safe) throw error;
        lastError = error;
        if (attempt < attempts - 1) await sleep(backoffMs * 2 ** attempt);
      }
    }
    throw lastError;
  };
}
