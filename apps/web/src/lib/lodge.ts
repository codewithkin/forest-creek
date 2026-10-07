/**
 * Forest Creek's real contact details, in one place.
 *
 * The team routes reservations to reservations@forestcreek.co.zw. The site
 * deliberately publishes ONE address so a guest can't reach a mailbox nobody
 * watches, and names no individual staff — only the lodge and its numbers.
 */
export const lodge = {
  name: "Forest Creek",
  address: "261 Rhine Farm, Lower Vumba, Mutare, Zimbabwe",
  shortAddress: "261 Rhine Farm, Lower Vumba",
  email: "reservations@forestcreek.co.zw",
  phone: "+263 71 995 6882",
  /** The number guests reach the Vumba Guide on. */
  whatsapp: "+263 71 995 6882",
} as const;

/** The numbers guests can call — published under the lodge's name only, no individual staff. */
export const contactPhones = ["+263 71 995 6882", "+263 78 832 1770"] as const;

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
  {
    label: "TikTok",
    handle: "@forest.creek8",
    href: "https://www.tiktok.com/@forest.creek8",
  },
] as const;

/** tel: and mailto: want the digits, not the spacing. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/\s/g, "")}`;
}
