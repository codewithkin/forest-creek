import { fromProperty, sheetDay, type SheetFrom } from "@/lib/sheet/document-sheet";

/**
 * The guest registration card on the letterhead: the paper card's fields in
 * three groups (guest, contact, stay), its conditions, and the guest's
 * signature. Import-free.
 */

export type RegistrationForLayout = {
  label: string;
  guestName: string;
  adults: number;
  children: number;
  childrenAges: string | null;
  nationality: string | null;
  idNumber: string | null;
  passportNumber: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  phoneWork: string | null;
  email: string | null;
  carRegistration: string | null;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  receiptNumber: string | null;
  paymentMethod: string | null;
  conditions: string;
  signature: string | null;
  signedAt: string | null;
  receptionist: string;
  property: { name: string; location: string; phone: string; email: string };
};

export type RegistrationLayout = {
  from: SheetFrom;
  number: string;
  sections: { title: string; rows: [string, string][] }[];
  conditions: string;
  signature: string | null;
  signedOn: string;
  receptionist: string;
};

const shown = (value: string | null | undefined) => (value && value.trim() ? value.trim() : "—");

const METHOD: Record<string, string> = { cash: "Cash", "bank transfer": "Bank transfer", ecocash: "EcoCash", card: "Card", other: "Other" };

export function registrationLayout(card: RegistrationForLayout): RegistrationLayout {
  return {
    from: fromProperty(card.property),
    number: card.label,
    sections: [
      {
        title: "Guest",
        rows: [
          ["Name", card.guestName],
          ["Adults", String(card.adults)],
          ["Children", card.children > 0 ? `${card.children}${card.childrenAges ? ` (ages ${card.childrenAges})` : ""}` : "None"],
          ["Nationality", shown(card.nationality)],
          ["ID no.", shown(card.idNumber)],
          ["Passport no.", shown(card.passportNumber)],
        ],
      },
      {
        title: "Contact",
        rows: [
          ["Address", shown(card.address)],
          ["City", shown(card.city)],
          ["Country", shown(card.country)],
          ["Cell", shown(card.phone)],
          ["Work phone", shown(card.phoneWork)],
          ["Email", shown(card.email)],
          ["Car registration", shown(card.carRegistration)],
        ],
      },
      {
        title: "Stay",
        rows: [
          ["Room", card.roomName],
          ["Check in", sheetDay(card.checkIn, "long")],
          ["Check out", sheetDay(card.checkOut, "long")],
          ["Nights", String(card.nights)],
          ["Receipt no.", shown(card.receiptNumber)],
          ["Payment", card.paymentMethod ? (METHOD[card.paymentMethod] ?? card.paymentMethod) : "—"],
        ],
      },
    ],
    conditions: card.conditions,
    signature: card.signature,
    signedOn: card.signedAt ? sheetDay(card.signedAt, "long") : "Not signed",
    receptionist: card.receptionist,
  };
}
