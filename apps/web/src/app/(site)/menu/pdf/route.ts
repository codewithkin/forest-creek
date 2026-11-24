import { api } from "@/lib/api";
import { renderMenuPdf } from "@/lib/menu/menu-pdf";

// The menu changes whenever staff edit it: rendered per request, never baked into the build.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The printable menu, on the letterhead. ?property=<slug> picks the lodge; the first menu otherwise. */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("property");
  const menus = await api.menu.public.query();
  const menu = menus.find((candidate) => candidate.property.slug === slug) ?? menus[0];
  if (!menu) return new Response("There is no menu yet", { status: 404 });

  const pdf = await renderMenuPdf(menu);
  const name = menu.property.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}-Menu.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
