/**
 * Forest Creek's real contact details, in one place.
 *
 * Taken from the managers' own business cards and the team's correction of
 * 21 September 2026: reservations are to be routed to admin@forestcreek.co.zw.
 * The cards also carry reservations@forestcreek.co.zw; the site deliberately
 * publishes ONE address so a guest can't reach a mailbox nobody watches.
 */
export const lodge = {
  name: "Forest Creek",
  address: "261 Rhine Farm, Lower Vumba, Mutare, Zimbabwe",
  shortAddress: "261 Rhine Farm, Lower Vumba",
  email: "admin@forestcreek.co.zw",
  phone: "+263 71 995 6882",
  /** The number guests reach the Vumba Guide on. */
  whatsapp: "+263 71 995 6882",
} as const;

export type Manager = {
  name: string;
  title: string;
  email: string;
  phones: string[];
};

/** Spelling and numbers as printed on the cards the team supplied. */
export const managers: Manager[] = [
  {
    name: "Sitembiso Ndlovu",
    title: "General Manager",
    email: "sndlovu@forestcreek.co.zw",
    phones: ["+263 71 995 6882", "+263 78 832 1770"],
  },
  {
    name: "Harry Michael",
    title: "Operations Manager",
    email: "hmichael@forestcreek.co.zw",
    phones: ["+263 71 992 6450", "+263 78 831 7025", "+263 77 301 9206"],
  },
];

/**
 * The lodge's own public accounts, confirmed against the handle the team
 * already uses for its Google/Gmail identity (forestcreeklodgezw).
 */
export const socials = [
  {
    label: "Facebook",
    handle: "Forest Creek Lodge",
    href: "https://www.facebook.com/p/Forest-Creek-Lodge-61574575229110/",
  },
  {
    label: "Instagram",
    handle: "@forestcreeklodgezw",
    href: "https://www.instagram.com/forestcreeklodgezw/",
  },
] as const;

/** tel: and mailto: want the digits, not the spacing. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/\s/g, "")}`;
}
