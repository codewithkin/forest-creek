import { describe, expect, test } from "bun:test";

import { documentFromText, escapeHtml, renderEmailHtml, renderEmailText, type EmailBrand, type EmailDocument } from "./layout";

const brand: EmailBrand = {
  name: "Forest Creek",
  tagline: "Where Nature Meets Luxury",
  siteUrl: "https://forestcreek.co.zw/",
  logoUrl: "https://forestcreek.co.zw/email/logo.png",
  address: "261 Rhine Farm, Lower Vumba, Mutare, Zimbabwe",
  phone: "+263 71 995 6882",
  email: "reservations@forestcreek.co.zw",
  socials: [{ label: "TikTok", href: "https://www.tiktok.com/@forest.creek8" }],
};

const doc: EmailDocument = {
  preheader: "Pay to secure your room",
  eyebrow: "Payment pending",
  title: "Your room is waiting for you",
  greeting: "Hello Tariro,",
  blocks: [
    { kind: "text", text: "Thank you for booking with Forest Creek Lodge." },
    { kind: "details", rows: [["Reference", "FC-ABC234"], ["Total", "$260"]] },
    { kind: "callout", text: "Please pay the deposit of $130." },
    { kind: "button", label: "Pay or check your payment here", url: "https://forestcreek.co.zw/pay/FC-ABC234" },
    { kind: "link", label: "Our Booking & Cancellation Policy", url: "https://forestcreek.co.zw/policies" },
  ],
  contactPhone: "+263 71 995 6882",
  signature: "Forest Creek Lodge",
};

describe("renderEmailText", () => {
  test("reads like a typed email, with every fact and link written out", () => {
    expect(renderEmailText(doc)).toBe(
      [
        "Hello Tariro,",
        "Thank you for booking with Forest Creek Lodge.",
        "Reference: FC-ABC234\nTotal: $260",
        "Please pay the deposit of $130.",
        "Pay or check your payment here: https://forestcreek.co.zw/pay/FC-ABC234",
        "Our Booking & Cancellation Policy: https://forestcreek.co.zw/policies",
        "Questions? Reply to this email or call +263 71 995 6882.\n\nForest Creek Lodge",
      ].join("\n\n"),
    );
  });
});

describe("renderEmailHtml", () => {
  const html = renderEmailHtml(doc, brand);

  test("is a complete, light-only HTML document with the title and hidden preheader", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain("<title>Your room is waiting for you</title>");
    expect(html).toContain("Pay to secure your room");
    expect(html).toContain("display:none");
  });

  test("carries the brand: logo, name, tagline, and the full contact footer", () => {
    expect(html).toContain('src="https://forestcreek.co.zw/email/logo.png"');
    expect(html).toContain("Where Nature Meets Luxury");
    expect(html).toContain("261 Rhine Farm, Lower Vumba");
    expect(html).toContain('href="tel:+263719956882"');
    expect(html).toContain('href="mailto:reservations@forestcreek.co.zw"');
    expect(html).toContain("https://www.tiktok.com/@forest.creek8");
    // No doubled slash from a site URL given with a trailing one.
    expect(html).not.toContain("forestcreek.co.zw//");
  });

  test("renders every block: details as rows, the call to action as a button", () => {
    expect(html).toContain("FC-ABC234");
    expect(html).toContain("Reference");
    expect(html).toContain('href="https://forestcreek.co.zw/pay/FC-ABC234"');
    expect(html).toContain("Pay or check your payment here &rarr;");
    expect(html).toContain("Please pay the deposit of $130.");
    expect(html).toContain("forestcreek.co.zw/policies");
  });

  test("the sign-off makes the phone number tappable", () => {
    expect(html).toContain('<a href="tel:+263719956882"');
    expect(html).toContain("Warm regards");
    expect(html).toContain("Forest Creek Lodge");
  });

  test("guest-supplied text is escaped, never interpreted", () => {
    const hostile = renderEmailHtml(
      { title: "Note", blocks: [{ kind: "callout", text: 'Guest notes: <script>alert("x")</script>' }] },
      brand,
    );
    expect(hostile).not.toContain("<script>");
    expect(hostile).toContain("&lt;script&gt;");
  });

  test("URLs inside a sentence become links; the sentence's full stop does not", () => {
    const linked = renderEmailHtml(
      { title: "Visit", blocks: [{ kind: "text", text: "Or visit https://forestcreek.co.zw/day-visits." }] },
      brand,
    );
    expect(linked).toContain('href="https://forestcreek.co.zw/day-visits"');
  });
});

describe("documentFromText", () => {
  test("lays an old plain-text message out as paragraphs under its subject", () => {
    const old = documentFromText("Booking confirmed", "Hello,\n\nIt is confirmed.\n\nForest Creek");
    expect(old.title).toBe("Booking confirmed");
    expect(old.blocks).toHaveLength(3);
  });
});

test("escapeHtml covers the five characters that matter", () => {
  expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});
