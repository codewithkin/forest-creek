-- The lodge's rooms have no fireplaces. Drop any "Fireplace(s)" amenity from
-- rooms and properties; staff can add one back in the dashboard if that changes.
UPDATE "room"
SET "amenities" = ARRAY(SELECT a FROM unnest("amenities") AS a WHERE a NOT ILIKE '%fireplace%')
WHERE EXISTS (SELECT 1 FROM unnest("amenities") AS a WHERE a ILIKE '%fireplace%');

UPDATE "property"
SET "amenities" = ARRAY(SELECT a FROM unnest("amenities") AS a WHERE a NOT ILIKE '%fireplace%')
WHERE EXISTS (SELECT 1 FROM unnest("amenities") AS a WHERE a ILIKE '%fireplace%');
