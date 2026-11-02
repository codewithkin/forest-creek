import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ShareDownload from "@/components/booking/share-download";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

// Reached from a link sent to one person; search engines have no business listing it.
export const metadata: Metadata = {
  title: "A file from Forest Creek",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ token: string }> };

export default async function SharedFilePage({ params }: Params) {
  const { token } = await params;
  const file = await api.files.shareInfo.query(decodeURIComponent(token)).catch(() => null);
  if (!file) notFound();

  return (
    <div className="mx-auto max-w-lg px-5 py-20">
      <span className="text-xs tracking-[0.2em] text-accent uppercase">Shared with you</span>
      <h1 className="mt-4 font-display text-3xl font-light break-words sm:text-4xl">{file.name}</h1>
      <div className="mt-8">
        <ShareDownload token={decodeURIComponent(token)} file={file} />
      </div>
    </div>
  );
}
