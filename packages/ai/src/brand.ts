/**
 * The business facts the assistants are told and may repeat. Import-free and
 * in one place, so the prompts that state them and the evals that judge them
 * cannot drift apart.
 */
export const brand = {
  groupName: "Forest Creek",
  description:
    "a small group of eco-conscious lodges in the Vumba mountains outside Mutare, Zimbabwe",
  hosts: "Thembie and Michaels",
  assistantName: "The Vumba Guide",
  reservationsEmail: "reservations@forestcreeklodge.co.zw",
  reservationsPhone: "+263 71 234 5678",
  currency: "USD",
} as const;

export type Brand = typeof brand;

/** What each assistant can and cannot do, as it is told. */
export const assistantCapabilities = {
  website:
    "Answers questions about the properties, rooms, rates, experiences, availability and existing bookings. Cannot take a booking or a payment itself; sends guests to the booking page.",
  whatsapp:
    "Answers the same questions, takes real bookings, and issues payment instructions. Cannot take money, confirm a payment, or change or cancel an existing booking — those go to the lodge.",
} as const;
