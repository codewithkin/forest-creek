import { formatMenuPrice, getMenu } from "@forest-creek/db";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { menuPageUrl } from "./links";
import { propertySlug, resolveProperty } from "./tools";

/**
 * What a property's kitchen and bar serve, with prices, as staff keep it on
 * the dashboard's Menu screen. The Guide quotes only this: never a dish or a
 * price the menu doesn't have.
 */
export const getMenuTool = createTool({
  id: "get-menu",
  description:
    "The food and bar menu at one property: breakfast, meals, drinks, with prices in USD, what is sold out, and whether breakfast is included with stays. " +
    "Use kind to fetch only food or only the bar when that is all the guest asked about.",
  inputSchema: z.object({
    propertySlug,
    kind: z.enum(["food", "bar", "all"]).default("all"),
  }),
  execute: async ({ propertySlug: slug, kind }) => {
    const resolved = await resolveProperty(slug);
    if ("error" in resolved) return { ok: false as const, error: resolved.error };
    const { property } = resolved;
    const sections = (await getMenu(property.id))
      .filter((section) => section.items.length > 0 && (kind === "all" || section.kind === kind))
      .map((section) => ({
        section: section.name,
        part: section.kind === "bar" ? "bar" : "food",
        note: section.note,
        items: section.items.map((item) => ({
          name: item.name,
          price: formatMenuPrice(item.priceCents),
          ...(item.description ? { description: item.description } : {}),
          ...(item.tags.length > 0 ? { labels: item.tags } : {}),
          ...(item.available ? {} : { soldOut: true }),
        })),
      }));

    return {
      ok: true as const,
      property: property.name,
      breakfastIncluded: property.breakfastIncluded,
      sections,
      menuPageUrl: menuPageUrl(property.slug),
      howToReply:
        sections.length === 0
          ? `${property.name} hasn't put its menu online yet. Say so, and offer the number ${property.phone} to ask what's cooking. Never describe dishes or prices.`
          : "Answer what the guest asked — a few items or one section, not the whole menu — with prices exactly as given. \"Ask\" means the team gives the price; say so. Say when something is sold out. " +
            "Offer menuPageUrl, exactly as returned, for the full menu. Never invent a dish, a drink, an ingredient or a price.",
    };
  },
});
