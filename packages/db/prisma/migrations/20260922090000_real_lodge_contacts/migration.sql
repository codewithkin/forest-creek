-- Replace the prototype's placeholder contact details with Forest Creek's real
-- ones. The property page reads phone/email off the row, so a deploy that only
-- fixed the seed would still show +263 71 234 5678 on the live site.
--
-- Scoped to the exact placeholder strings: anything a manager has already
-- edited in the dashboard is left alone.
UPDATE "property"
SET "phone" = '+263 71 995 6882'
WHERE "phone" = '+263 71 234 5678';

UPDATE "property"
SET "email" = 'admin@forestcreek.co.zw'
WHERE "email" IN ('reservations@forestcreeklodge.co.zw', 'reservations@forestcreek.co.zw');

UPDATE "property"
SET "location" = '261 Rhine Farm, Lower Vumba, Mutare, Zimbabwe'
WHERE "location" = 'Vumba Mountains, Mutare, Zimbabwe';
