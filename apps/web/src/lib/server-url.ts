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

  return publicServerUrl(url);
}

/**
 * The API origin a BROWSER can reach. Deliberately ignores SERVER_URL: in
 * production that is the container-to-container address (http://server:3000),
 * which resolves for a server component and for nobody else. Anything rendered
 * into the HTML — an <img src>, a link — has to be built from this, or the
 * page loads for the server and shows blank boxes on every phone and PC.
 */
export function publicServerUrl(url: string = env.NEXT_PUBLIC_SERVER_URL) {
  const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

  if (!normalized.startsWith("/")) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalized}`;
  }

  const processEnv = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
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

/**
 * Resolves an image reference to something a browser can fetch.
 *
 * Three kinds reach this: seeded photographs the API serves under /media/,
 * uploads that are already absolute R2 URLs, and assets that ship with the web
 * app (/images/..., /brand-icon.png). Only the first needs the API origin —
 * prefixing a web-app asset with it sends the browser to the API for a file
 * that only the web app has, which is a 404 and a blank frame.
 */
export function mediaUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  if (path.startsWith("/media/")) return `${publicServerUrl()}${path}`;
  if (path.startsWith("/")) return path;
  return `${publicServerUrl()}/media/${path}`;
}
