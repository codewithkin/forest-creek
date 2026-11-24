import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  addMenuTemplate,
  createMenuItem,
  createMenuSection,
  deleteMenuSection,
  getMenu,
  getPublicMenus,
  menuItemProperty,
  prisma,
  reorderMenu,
  updateMenuItem,
  updateMenuSection,
} from "./index";

const SLUG = "menu-test";
let propertyId: string;
const remove = () => prisma.property.deleteMany({ where: { slug: SLUG } });

beforeAll(async () => {
  await remove();
  const property = await prisma.property.create({
    data: {
      slug: SLUG, name: "Menu House", tagline: "-", description: "-", location: "-", phone: "-",
      email: "m@example.com", heroImage: "/media/x.jpg", breakfastIncluded: true, sortOrder: 999,
    },
  });
  propertyId = property.id;
});
afterAll(remove);

describe("a property's menu", () => {
  test("the template lays out food then bar sections, and adding it again adds nothing", async () => {
    expect(await addMenuTemplate(propertyId)).toBe(12);
    expect(await addMenuTemplate(propertyId)).toBe(0);
    const menu = await getMenu(propertyId);
    expect(menu[0]).toMatchObject({ name: "Breakfast", kind: "food", note: "Served 7 to 10am" });
    expect(menu.at(-1)).toMatchObject({ name: "Spirits", kind: "bar" });
  });

  test("items keep their order and price; sold out stays listed; hidden sections leave the menu", async () => {
    const [breakfast] = await getMenu(propertyId);
    const full = await createMenuItem({ sectionId: breakfast!.id, name: "Full English", priceCents: 800, tags: ["House favourite"] });
    const porridge = await createMenuItem({ sectionId: breakfast!.id, name: "Porridge", priceCents: null });
    expect(full.sortOrder).toBe(0);
    expect(porridge.sortOrder).toBe(1);

    await reorderMenu({ sectionId: breakfast!.id, itemIds: [porridge.id, full.id] });
    await updateMenuItem({ id: full.id, available: false });
    expect((await getMenu(propertyId))[0]!.items.map((item) => [item.name, item.available])).toEqual([
      ["Porridge", true],
      ["Full English", false],
    ]);
    expect(await menuItemProperty(full.id)).toBe(propertyId);

    // Only sections with something in them reach the public menu.
    const mine = (await getPublicMenus()).find((menu) => menu.property.slug === SLUG);
    expect(mine?.sections.map((section) => section.name)).toEqual(["Breakfast"]);
    expect(mine?.property.breakfastIncluded).toBe(true);

    await updateMenuSection({ id: breakfast!.id, active: false });
    expect((await getPublicMenus()).some((menu) => menu.property.slug === SLUG)).toBe(false);
    expect((await getMenu(propertyId, { includeHidden: true }))[0]!.active).toBe(false);
  });

  test("a stale order cannot move another property's sections, and a section goes with its items", async () => {
    const other = await prisma.menuSection.findFirstOrThrow({ where: { propertyId: { not: propertyId } } }).catch(() => null);
    const sections = await getMenu(propertyId, { includeHidden: true });
    await reorderMenu({ propertyId, sectionIds: [...sections.map((s) => s.id).reverse(), ...(other ? [other.id] : [])] });
    if (other) expect((await prisma.menuSection.findUniqueOrThrow({ where: { id: other.id } })).propertyId).not.toBe(propertyId);

    const section = await createMenuSection({ propertyId, name: "Specials", kind: "food" });
    await createMenuItem({ sectionId: section.id, name: "Chef's stew", priceCents: 1200 });
    await deleteMenuSection(section.id);
    expect(await prisma.menuItem.count({ where: { sectionId: section.id } })).toBe(0);
  });
});
