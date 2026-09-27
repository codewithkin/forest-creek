import { lookup as osLookup, Resolver, type LookupAddress, type LookupOptions } from "node:dns";

import { Agent, fetch as undiciFetch } from "undici";

/**
 * Found in production: the web container's own resolver stopped answering for
 * api.forestcreek.co.zw (getaddrinfo ENOTFOUND) for long enough that retries
 * could not help, and the home page stayed down. When the system resolver
 * fails, the name is asked of public DNS servers instead, so the site keeps
 * working even before SERVER_URL is set to the internal address.
 */
const PUBLIC_DNS = ["1.1.1.1", "8.8.8.8", "9.9.9.9"];
const RESOLVER_FAILURES = new Set(["ENOTFOUND", "EAI_AGAIN"]);

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type Lookup = (hostname: string, options: LookupOptions, callback: LookupCallback) => void;
type Resolve4 = (hostname: string, callback: (error: NodeJS.ErrnoException | null, addresses: string[]) => void) => void;

/** A net/tls `lookup` that falls back to `resolve4` when the system resolver cannot find the name. */
export function fallbackLookup(system: Lookup, resolve4: Resolve4): Lookup {
  return (hostname, options, callback) => {
    system(hostname, options, (error, address, family) => {
      if (!error || !error.code || !RESOLVER_FAILURES.has(error.code)) return callback(error, address, family);
      resolve4(hostname, (fallbackError, addresses) => {
        if (fallbackError || addresses.length === 0) return callback(error, address, family);
        if (options.all) return callback(null, addresses.map((ip) => ({ address: ip, family: 4 })));
        callback(null, addresses[0]!, 4);
      });
    });
  };
}

const publicResolver = new Resolver({ timeout: 3000, tries: 2 });
publicResolver.setServers(PUBLIC_DNS);

const agent = new Agent({
  connect: {
    lookup: fallbackLookup(osLookup as unknown as Lookup, (hostname, callback) =>
      publicResolver.resolve4(hostname, callback),
    ) as never,
  },
});

/** fetch whose name lookups survive a broken container resolver. */
export const dnsFallbackFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
  undiciFetch(input as never, { ...(init as object), dispatcher: agent } as never) as unknown as Promise<Response>;
