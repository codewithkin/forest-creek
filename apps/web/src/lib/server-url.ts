import { env } from "@forest-creek/env/web";

/**
 * Resolves the API origin. NEXT_PUBLIC_SERVER_URL may be absolute or a path;
 * a path has to be made absolute differently on the server, in the browser and
 * on Vercel, which is why this is more than a string concat.
 */
export function getServerUrl(url: string = env.NEXT_PUBLIC_SERVER_URL) {
  const processEnv = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  if (typeof window === "undefined" && processEnv?.SERVER_URL) {
    return processEnv.SERVER_URL.endsWith("/")
      ? processEnv.SERVER_URL.slice(0, -1)
      : processEnv.SERVER_URL;
  }

  const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

  if (!normalized.startsWith("/")) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalized}`;
  }

  const vercelUrl =
    processEnv?.VERCEL_ENV === "production"
      ? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
      : (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelUrl) {
    const origin = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return `${origin}${normalized}`;
  }

  return `http://localhost:3000${normalized}`;
}

/** Room and activity images are served by the API, not from Next's public dir. */
export function mediaUrl(path: string) {
  return `${getServerUrl()}${path}`;
}
