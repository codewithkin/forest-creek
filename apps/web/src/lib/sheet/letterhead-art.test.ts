import { describe, expect, test } from "bun:test";

import { footerLines, fromProperty } from "./document-sheet";
import { dividerShapes, footerShapes, headerShapes, lettersOnCircle, PAGE, stampLetters, stampShapes, watermarkShapes } from "./letterhead-art";

describe("letterhead art", () => {
  test("every shape is real numbers: a NaN would silently drop it from the PDF", () => {
    const all = [...headerShapes(), ...dividerShapes(), ...watermarkShapes(), ...footerShapes(), ...stampShapes()];
    for (const shape of all) {
      expect(JSON.stringify(shape)).not.toContain("NaN");
      expect(JSON.stringify(shape)).not.toContain("Infinity");
    }
  });

  test("the band and the footer are closed shapes spanning the page", () => {
    const band = headerShapes()[0]!;
    expect(band.kind === "path" && band.d.startsWith("M 0 0") && band.d.endsWith("Z")).toBe(true);
    const footer = footerShapes()[0]!;
    expect(footer.kind === "path" && footer.d.includes(`L ${PAGE.width}`) && footer.d.endsWith("Z")).toBe(true);
  });

  test("the stamp's lettering runs left to right over the top and under the bottom", () => {
    const { top, bottom } = stampLetters();
    expect(top.map((glyph) => glyph.character).join("")).toBe("FOREST CREEK");
    expect(top[0]!.x).toBeLessThan(top.at(-1)!.x);
    expect(bottom[0]!.x).toBeLessThan(bottom.at(-1)!.x);
    expect(bottom.every((glyph) => glyph.y > 50)).toBe(true);
    const [only] = lettersOnCircle("A", 0, 0, 10, 0, 90);
    expect([only!.x, only!.y, only!.rotate]).toEqual([0, -10, 0]);
  });
});

describe("footerLines", () => {
  test("the group's own name is in the band already; another property is named before its address", () => {
    const lodge = { name: "Forest Creek", location: "261 Rhine Farm, Lower Vumba", phone: "+263 71 995 6882", email: "reservations@forestcreek.co.zw" };
    expect(footerLines(fromProperty(lodge))).toEqual({ place: "261 Rhine Farm, Lower Vumba", email: lodge.email, contacts: ["+263 71 995 6882"] });
    expect(footerLines(fromProperty({ ...lodge, name: "Misty Ridge" }, ["a@b.co", ""])).place).toBe("Misty Ridge · 261 Rhine Farm, Lower Vumba");
    expect(footerLines(fromProperty(lodge, ["a@b.co", ""])).contacts).toEqual(["a@b.co"]);
  });
});
