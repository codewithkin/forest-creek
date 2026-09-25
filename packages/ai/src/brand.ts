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
  // The team's correction of 21 September 2026: reservations go to admin@.
  // The printed cards also carry reservations@forestcreek.co.zw, but the
  // assistants quote ONE address so nobody is sent to an unwatched mailbox.
  reservationsEmail: "admin@forestcreek.co.zw",
  reservationsPhone: "+263 71 995 6882",
  address: "261 Rhine Farm, Lower Vumba, Mutare, Zimbabwe",
  currency: "USD",
} as const;

export type Brand = typeof brand;

/**
 * What the guest can actually do with each assistant, written the way a guest
 * would say it — digested from the tools, never naming them. The prompts state
 * this, and the evals judge on the same facts, so they must not drift apart.
 */
export const assistantCapabilities = {
  website:
    "You can ask me about any of our properties, the rooms and their nightly rates, the experiences you can add to a stay, day visits for a day out without staying the night, and whether rooms are free on the dates you have in mind. I can also look up a booking you already made with its reference code. I can't take a booking or a payment myself — when you're ready to book, I'll send you to the booking page, where a 50% deposit secures your stay and you can pay by EcoCash, OneMoney, InnBucks, or Visa or Mastercard. I can also explain our booking and cancellation policy.",
  whatsapp:
    "You can ask me about any of our properties, the rooms and their nightly rates, the experiences you can add to a stay, day visits for a day out without staying the night, and whether rooms are free on the dates you have in mind. You can also book a stay right here in the chat — tell me the property, your dates, the room you want, how many guests, your name and an email, and how you'll pay. Once you've booked, I can start an EcoCash or OneMoney payment on your phone — the 50% deposit that secures the stay, the balance later, or everything at once — and check whether it has gone through, and I can look up a booking you already made with its FC- reference. If you'd rather pay by InnBucks or by Visa or Mastercard, I'll book the stay and send you a secure payment page to finish paying there. What I can't do: I can't take the payment myself or see your PIN — the payment service charges your phone directly. I can't change or cancel an existing booking, and for special requests, transfers, group rates or discounts the lodge will pick that up.",
} as const;
