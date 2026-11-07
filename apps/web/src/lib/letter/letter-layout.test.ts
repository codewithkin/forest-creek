import { describe, expect, test } from "bun:test";

import { registrationLayout, type RegistrationForLayout } from "@/lib/registration/registration-layout";

import { letterLayout, paragraphsOf } from "./letter-layout";

const property = { name: "Forest Creek Lodge", location: "261 Rhine Farm, Lower Vumba", phone: "+263 71 995 6882", email: "reservations@forestcreek.co.zw" };

describe("letterLayout", () => {
  test("blank lines make paragraphs; single breaks stay inside one", () => {
    expect(paragraphsOf("Dear Sir,\r\n\r\nWe confirm:\n- 2 nights\n- breakfast\n\n\nRegards")).toEqual(["Dear Sir,", "We confirm:\n- 2 nights\n- breakfast", "Regards"]);
  });

  test("the letterhead carries the property's address, phone and email; the sign-off defaults politely", () => {
    const layout = letterLayout({
      label: "LTR-2026-0004",
      recipient: "Mr Moyo\n 12 Main Street \n\nMutare",
      subject: " Confirmation of stay ",
      body: "This is to confirm…",
      closing: " ",
      signerName: "Sithembiso Ndlovu",
      signerTitle: "",
      letterDate: "2026-11-02",
      property,
    });
    expect(layout.from).toEqual({ name: "Forest Creek Lodge", address: "261 Rhine Farm, Lower Vumba", email: "reservations@forestcreek.co.zw", contacts: ["+263 71 995 6882"] });
    expect([layout.signature, layout.stamped]).toEqual([null, true]);
    expect([layout.date, layout.recipient, layout.subject, layout.closing, layout.signerTitle]).toEqual(["2 November 2026", ["Mr Moyo", "12 Main Street", "Mutare"], "Confirmation of stay", "Yours faithfully", null]);
  });

  test("a letter one of the officials signs carries their own email and phones, as their letterhead does", () => {
    const base = { label: "L", recipient: "To whom it may concern", subject: "S", body: "B", closing: "Yours sincerely", signerTitle: null, letterDate: "2026-11-02", property };
    expect(letterLayout({ ...base, signerName: " harry  michael " }).from.contacts).toEqual(["hmichael@forestcreek.co.zw", "+263 71 992 6450", "+263 77 301 9206"]);
    expect(letterLayout({ ...base, signerName: "M.S Musemhu" }).from.contacts).toEqual(["+263 77 376 3080"]);
    expect(letterLayout({ ...base, signerName: "A Visitor", stamped: false }).from.contacts).toEqual(["+263 71 995 6882"]);
  });
});

const card: RegistrationForLayout = {
  label: "REG-0201",
  guestName: "Mr Moyo",
  adults: 2,
  children: 2,
  childrenAges: "4, 7",
  nationality: "Zimbabwean",
  idNumber: null,
  passportNumber: "FN123456",
  address: null,
  city: "Harare",
  country: "Zimbabwe",
  phone: "0771234567",
  phoneWork: null,
  email: null,
  carRegistration: "AGQ 9451",
  roomName: "Executive Room",
  checkIn: "2026-08-18",
  checkOut: "2026-08-20",
  nights: 2,
  receiptNumber: null,
  paymentMethod: "cash",
  conditions: "Conditions…",
  signature: null,
  signedAt: null,
  receptionist: "Sithembiso Ndlovu",
  property,
};

describe("registrationLayout", () => {
  test("the paper card's fields in three groups, blanks as a dash", () => {
    const layout = registrationLayout(card);
    expect(layout.sections.map((section) => section.title)).toEqual(["Guest", "Contact", "Stay"]);
    const all = Object.fromEntries(layout.sections.flatMap((section) => section.rows));
    expect(all).toMatchObject({ Children: "2 (ages 4, 7)", "ID no.": "—", "Passport no.": "FN123456", "Car registration": "AGQ 9451", "Check in": "18 August 2026", Payment: "Cash" });
    expect(layout.signedOn).toBe("Not signed");
  });
});
