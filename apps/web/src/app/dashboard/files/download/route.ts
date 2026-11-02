import { uniquePaths, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES, ZipWriter } from "@forest-creek/storage/zip";
import { headers } from "next/headers";

import { apiWithCookie } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ids = (value: string | null) => (value ? value.split(",").filter((id) => /^[a-z0-9]{10,40}$/i.test(id)).slice(0, 1000) : []);

/**
 * A selection of files and folders as one zip, folders kept as folders.
 * Only the staff cookie goes to the API, which checks the session and the
 * property scope and hands back short links; the bytes stream from R2
 * through here to the browser, one file at a time, so memory stays small.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fileIds = ids(url.searchParams.get("files"));
  const folderIds = ids(url.searchParams.get("folders"));
  if (fileIds.length + folderIds.length === 0) return new Response("Nothing chosen to download", { status: 400 });

  const cookie = (await headers()).get("cookie") ?? "";
  let plan;
  try {
    plan = await apiWithCookie(cookie).files.downloadPlan.query({ fileIds, folderIds });
  } catch {
    return new Response("Those files aren't available", { status: 404 });
  }
  if (plan.length === 0) return new Response("There are no files in what you chose", { status: 404 });
  const total = plan.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (total > ZIP_MAX_BYTES || plan.length > ZIP_MAX_ENTRIES) {
    return new Response("That's too much for one download. Choose fewer folders.", { status: 413 });
  }

  const paths = uniquePaths(plan.map((file) => file.path));
  const name = (url.searchParams.get("name") ?? "Forest Creek files").replace(/[^\w .()-]/g, "").trim() || "Forest Creek files";
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();

  void (async () => {
    const zip = new ZipWriter((chunk) => writer.write(chunk));
    const missed: string[] = [];
    for (const [index, file] of plan.entries()) {
      try {
        const response = await fetch(file.url, { signal: AbortSignal.timeout(90_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await zip.add(paths[index]!, new Uint8Array(await response.arrayBuffer()), new Date(file.createdAt));
      } catch {
        missed.push(paths[index]!);
      }
    }
    // A file the store couldn't give is listed, not silently left out.
    if (missed.length) {
      await zip.add("_not-included.txt", new TextEncoder().encode(`These files couldn't be fetched just now. Download them again from Files:\n\n${missed.join("\n")}\n`));
    }
    await zip.finish();
    await writer.close();
  })().catch((error: unknown) => {
    console.error(`[files] zip download failed: ${error instanceof Error ? error.name : "unknown"}`);
    void writer.abort(error);
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
