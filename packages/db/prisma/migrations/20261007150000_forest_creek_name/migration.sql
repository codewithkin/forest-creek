-- The group is simply "Forest Creek": its houses are not all in the Vumba.
-- Renames the property staff had named "FOREST CREEK VUMBA", and the name
-- snapshotted onto its bookings, so emails and receipts stop using it.
UPDATE "property" SET "name" = 'Forest Creek' WHERE lower(trim("name")) = 'forest creek vumba';
UPDATE "booking" SET "propertyName" = 'Forest Creek' WHERE lower(trim("propertyName")) = 'forest creek vumba';
