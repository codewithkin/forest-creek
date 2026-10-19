/**
 * The business facts the assistants are told and may repeat. Import-free and
 * in one place, so the prompts that state them and the evals that judge them
 * cannot drift apart.
 */
export const brand = {
  groupName: "Forest Creek",
  description:
    "a small group of eco-conscious lodges in Zimbabwe",
  assistantName: "The Forest Creek Guide",
  // Reservations go to reservations@forestcreek.co.zw; the assistants quote
  // ONE address so nobody is sent to an unwatched mailbox.
  reservationsEmail: "reservations@forestcreek.co.zw",
  reservationsPhone: "+263 71 995 6882",
  address: "261 Rhine Farm, Lower Vumba, Mutare, Zimbabwe",
  currency: "USD",
  tagline: "Where Nature Meets Luxury",
  // The lodge's public accounts; the web footer lists the same ones
  // (apps/web/src/lib/lodge.ts).
  socials: [
    { label: "Facebook", href: "https://www.facebook.com/p/Forest-Creek-Lodge-61574575229110/" },
    { label: "Instagram", href: "https://www.instagram.com/forestcreeklodgezw/" },
    { label: "TikTok", href: "https://www.tiktok.com/@forest.creek8" },
  ],
} as const;

export type Brand = typeof brand;

/**
 * What the guest can actually do with each assistant, written the way a guest
 * would say it — digested from the tools, never naming them. The prompts state
 * this, and the evals judge on the same facts, so they must not drift apart.
 */
export const assistantCapabilities = {
  website:
    "You can ask me about any of our properties, the rooms and their nightly rates, the experiences you can add to a stay, day visits for a day out without staying the night, and whether rooms are free on the dates you have in mind — and I can show you photos. You can also book a stay right here in the chat — tell me the property, your dates, the room you want, how many guests, your name, an email and a phone number, and how you'll pay. Once you've booked, I can start an EcoCash or OneMoney payment on your phone — the 50% deposit that secures the stay, the balance later, or everything at once — and check whether it has gone through. If you'd rather pay by InnBucks or by Visa or Mastercard, I'll send you a secure payment page. I can look up a booking with its FC- reference, tell you exactly what's paid and what's still due, point you to your receipts, switch how you pay, and work out what cancelling or moving your dates would cost under our policy. What I can't do: I can't take the payment myself or see your PIN — the payment service charges your phone directly. I can't cancel a booking or change its dates myself — the reservations team does that — and for special requests, transfers, group rates or discounts the lodge will pick that up.",
  whatsapp:
    "You can ask me about any of our properties, the rooms and their nightly rates, the experiences you can add to a stay, day visits for a day out without staying the night, and whether rooms are free on the dates you have in mind. You can also book a stay right here in the chat — tell me the property, your dates, the room you want, how many guests, your name and an email, and how you'll pay. Once you've booked, I can start an EcoCash or OneMoney payment on your phone — the 50% deposit that secures the stay, the balance later, or everything at once — and check whether it has gone through. I can find the bookings you made from this number even if you've lost the reference, tell you exactly what's paid and what's still due, point you to your receipts, and switch how you pay — EcoCash, OneMoney, or a secure payment page for InnBucks, Visa or Mastercard. I can also work out what cancelling or moving your dates would cost under our policy. What I can't do: I can't take the payment myself or see your PIN — the payment service charges your phone directly. I can't cancel a booking or change its dates myself — the reservations team does that — and for special requests, transfers, group rates or discounts the lodge will pick that up.",
} as const;
