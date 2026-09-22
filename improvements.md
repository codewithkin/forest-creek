# Forest Creek Website Improvements

This document consolidates the website feedback from the WhatsApp conversation, voice notes, screenshots, and supplied business-card images. Repeated requests have been merged into one requirement so that nothing is omitted or listed twice.

## Priority guide

- **P0 — Required for the core booking experience or launch.**
- **P1 — Important content, usability, or administration improvement.**
- **P2 — Polish or follow-up improvement.**

## Implementation notes from the client

- The application already has a backend admin system that allows Forest Creek staff to upload and manage properties and rooms. Do not ask the client to provide room names as a prerequisite for the current booking work; inspect the existing admin screens, database schema, and APIs and extract the room data from there.
- Amenities per property are planned for a later pass. Do not make property amenities a booking-launch blocker unless the codebase shows that the current booking flow already depends on them.
- The confirmed payment methods are **EcoCash, OneMoney, InnBucks, and Visa**, all processed through **Paynow**. The implementation should not assume that a separate international payment provider is needed before verifying Paynow’s Visa configuration.
- Some questions are business-policy decisions and must still be confirmed by the client. Other questions should become clear while an agent scans the existing codebase. Before asking a repeated question, inspect the backend admin system, database models, payment package, and current booking-related code.

## 1. Guest-facing website

### P0 — Fix responsive image loading and display

- Fix the image-display errors seen on Android and desktop/PC, including the large empty image area on the room/property view.
- Ensure the same images render correctly on iOS, Android, and desktop browsers.
- Remove broken-image states and AI placeholders from production pages.
- Use responsive sizing and cropping so that images do not disappear, become distorted, or leave excessive blank space.
- Test every changed image at mobile and desktop breakpoints before release.

### P0 — Add a multi-image gallery for every room

- Allow each room to contain multiple images instead of only one image.
- The gallery should support photographs of the room, kitchen, bathroom, exterior, and other useful areas.
- Allow the administrator to upload, replace, reorder, and remove room images from the back office.
- Make the gallery usable on mobile as well as desktop.

### P0 — Activate activities and experiences

- Add an activities/experiences section to the website; it is currently inactive or missing.
- Tie each activity to the relevant property.
- Allow the administrator to create and edit activities in the back office in the same way rooms can be managed.
- Support an activity name, description, images, and price.
- Support activities that are free as well as activities that have an additional charge. A free/no-charge option must be available.
- Initial examples mentioned in the chat include a braai, jumping castle, and swimming.

### P0 — Make booking availability controllable

- Give the administrator control over occupied dates and room availability.
- Allow an administrator to cancel or remove a booking so that a room does not remain marked as occupied when nobody is using it.
- Provide a clear way to correct stale or incorrect reservation data in the database.
- Ensure the booking calendar, room status, and reservation records stay synchronized.
- Confirm the remaining booking rules with the client: check-in and check-out times, minimum number of nights, and whether any dates should be blocked. The team expects the business to remain open most of the time, so blocked dates may be rare.

### P0 — Complete the payment and reservation flow

- Finish the real booking flow, including reservation payments.
- Integrate Paynow as discussed in the chat.
- Configure and present the confirmed Paynow methods: EcoCash, OneMoney, InnBucks, and Visa.
- Verify that Visa payments through Paynow work for the intended international guests and currency configuration; do not add a second provider unless Paynow cannot satisfy that requirement.
- Make the available payment methods clear at the point where a guest pays.
- Confirm whether guests pay the full amount or a deposit, and document the cancellation, refund, and no-show policy.

### P0 — Correct reservation email routing

- Use `admin@forestcreek.co.zw` for the reservation/admin email routing as requested by the Forest Creek team.
- The supplied business-card images also show `reservations@forestcreek.co.zw`; confirm whether this should remain a public booking inbox or be replaced. Do not leave conflicting email addresses in different parts of the site.

### P1 — Improve the homepage and navigation

- Add or restore a clear **Home** button/link in the navigation and on relevant inner pages.
- Use the supplied homepage visual as the homepage hero or primary image after confirming the final version.
- Replace the current placeholder or incorrect homepage/room image with the supplied replacement image.
- Confirm that the mobile navigation menu exposes the Home link and the main booking path.

### P1 — Add the requested story content and visuals

- Add the **Our Story** content and its supplied image.
- Add the supplied **“The Mist Is Waiting”** write-up and place it in the intended story or homepage section.
- Use the supplied visual assets in the sections indicated in the chat rather than leaving temporary AI-generated placeholders.
- Replace the current footer image with the supplied replacement image where requested.

### P1 — Add social-media links

- Add direct links to Forest Creek’s Facebook and Instagram pages.
- Place the links where guests can find them easily, such as the footer and/or contact section.
- Derive the correct public URLs from the official Forest Creek accounts and verify that the links open successfully.

### P1 — Correct text alignment and mobile layout

- Review the mobile layout for text-alignment problems in multiple locations.
- Check headings, descriptions, tags, buttons, and card content for consistent alignment, spacing, and readable line wrapping.
- Test both Android and iOS widths, not only one mobile device.

### P2 — Complete image tagging

- Finish the picture-tagging interface shown in the screenshots.
- Support the additional/second tag requested during testing.
- Make sure tags are saved with the correct image and displayed consistently wherever that image appears.

## 2. Back-office and administration

### P0 — Provide complete media management

- The administrator must be able to manage multiple images for a single room.
- The administrator must be able to upload, replace, reorder, delete, and tag images.
- The administrator must be able to replace the incorrect image shown on the desktop/admin view.
- Validate uploaded images and show a useful error instead of silently producing a blank area.

### P0 — Provide activity management

- Add an activities section to the back office.
- Allow administrators to create, edit, publish, unpublish, and delete property-linked activities.
- Include fields for the activity name, description, images, price, and whether the activity is free.

### P0 — Provide booking and date controls

- Add an administrative view for occupied dates and room bookings.
- Allow authorized administrators to cancel bookings and release dates.
- Make corrections visible in the public availability view without requiring manual database intervention.

### P1 — Add accurate manager and contact information

- Add the full manager names, job titles, telephone numbers, and email addresses supplied by the Forest Creek team.
- Verify the spelling before publishing. The supplied cards identify **Harry Michael** as Operations Manager and **Stembiso Ndlovu** as General Manager.
- The supplied contact cards show the Forest Creek address as **261 Rhine Farm, Lower Vumba**.
- Keep contact information consistent across the contact page, footer, booking area, and any administrator-facing content.
- Treat the details in the photographed cards as source material and confirm any unclear digit or spelling before the final release.

## 3. Connected systems and production readiness

### P0 — Connect the four systems safely

- Connect the AI agent, website, mobile app, and shared database so that they work together.
- Keep the connections isolated so that each system has only the access it needs.
- Verify that booking, availability, customer messages, and payment status do not diverge between systems.

### P0 — Set up a dedicated WhatsApp number for the AI agent

- Use a separate Forest Creek business WhatsApp number for the agent instead of continuing to use the intermediary’s personal number.
- Pair the number through the required QR-code onboarding process.
- Keep the agent standalone, while preserving a clear operational process for authorized staff to monitor or respond to customers when necessary.
- Test the complete flow with the Forest Creek team’s prepared number before launch.

### P0 — Finalize domain, hosting, and deployment

- Keep the production site running on the Forest Creek domain, `forestcreek.co.zw`.
- Complete the production hosting setup so the website can remain live without depending on the old WordPress/Webzim hosting arrangement.
- Confirm that the domain, HTTPS, application, database, email routing, and latest deployment all point to the production system.
- Re-test the site after every production deployment, especially the booking and image features.

## 4. Final acceptance checks

Before calling the current stage complete, verify the following in one pass:

1. A guest can open the site on iOS, Android, and desktop without broken or blank images.
2. A room can display several photographs, including kitchen, bathroom, and exterior images.
3. An administrator can manage room images, image tags, activities, prices, free activities, occupied dates, and booking cancellations.
4. A guest can see accurate availability and complete a booking payment using a Zimbabwean or international method.
5. The reservation email, manager information, address, social links, homepage, story content, and footer image are correct.
6. The Home link, mobile navigation, text alignment, image sizing, and responsive layout work at common screen sizes.
7. The WhatsApp agent uses the dedicated Forest Creek number and the website, mobile app, agent, and database remain synchronized.

## Items intentionally not treated as website features

The voice notes also discussed the temporary hosting payment, payment stages, quotation tracking, and receiving the Forest Creek WhatsApp number. Those are operational or commercial follow-ups rather than website improvements, so they are kept separate from the feature backlog above.

## References

[1]: file:///home/ubuntu/upload/WhatsAppChatwithMrChikono.txt "WhatsApp chat export with Mr Chikono"
[2]: file:///home/ubuntu/upload/AUD-20260917-WA0030.opus "17 September 2026 voice note"
[3]: file:///home/ubuntu/upload/PTT-20260915-WA0068.opus "15 September 2026 voice note"
[4]: file:///home/ubuntu/upload/PTT-20260920-WA0032.opus "20 September 2026 voice note"
[5]: file:///home/ubuntu/upload/IMG-20260920-WA0033.jpg "Mobile text-alignment screenshot"
[6]: file:///home/ubuntu/upload/IMG-20260920-WA0049.jpg "Cross-device image-display screenshot"
[7]: file:///home/ubuntu/upload/IMG-20260921-WA0029.jpg "Mobile room-image screenshot"
[8]: file:///home/ubuntu/upload/IMG-20260921-WA0036.jpg "Operations manager contact card"
[9]: file:///home/ubuntu/upload/IMG-20260921-WA0037.jpg "General manager contact card"
