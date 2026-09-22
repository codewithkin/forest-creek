-- The prototype seeded the Vumba drive with /media/vumba-drive.webp, a file
-- that was never shipped, so the card rendered as a placeholder. Point it at a
-- photo the API actually serves. Scoped to the exact broken path, so a photo a
-- manager has since uploaded is left alone.
UPDATE "activity"
SET "image" = '/media/forest-walk.webp'
WHERE "image" = '/media/vumba-drive.webp';

UPDATE "activity"
SET "images" = ARRAY_REPLACE("images", '/media/vumba-drive.webp', '/media/forest-walk.webp')
WHERE '/media/vumba-drive.webp' = ANY("images");
