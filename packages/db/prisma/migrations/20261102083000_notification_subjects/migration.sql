-- A notification is about at most one thing: a stay, a day visit or a
-- quotation. One about none of those (a scheduled report) must carry a
-- dedupeKey instead, so every row still has an owner or an identity.
ALTER TABLE "notification" DROP CONSTRAINT "notification_one_subject_check";

ALTER TABLE "notification" ADD CONSTRAINT "notification_one_subject_check" CHECK (
  (num_nonnulls("bookingId", "dayVisitBookingId", "quoteId") = 1)
  OR (num_nonnulls("bookingId", "dayVisitBookingId", "quoteId") = 0 AND "dedupeKey" IS NOT NULL)
);
