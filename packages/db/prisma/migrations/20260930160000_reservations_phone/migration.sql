-- Reservations phone is +263 71 995 6882. The live "main" property still
-- carried 0775101506 (entered in the dashboard, so no earlier migration
-- touched it).
--
-- Scoped to that number only, in any common spelling (0775101506,
-- 077 510 1506, +263 77 510 1506): every other phone is left alone.
UPDATE "property"
SET "phone" = '+263 71 995 6882'
WHERE regexp_replace("phone", '[^0-9]', '', 'g') IN ('0775101506', '263775101506');

-- The same number written inside the property's own copy.
UPDATE "property"
SET "description" = regexp_replace("description", '(\+?263[ -]?|0)7[ -]?7[ -]?5[ -]?1[ -]?0[ -]?1[ -]?5[ -]?0[ -]?6', '+263 71 995 6882', 'g'),
    "tagline" = regexp_replace("tagline", '(\+?263[ -]?|0)7[ -]?7[ -]?5[ -]?1[ -]?0[ -]?1[ -]?5[ -]?0[ -]?6', '+263 71 995 6882', 'g'),
    "paymentInstructions" = regexp_replace("paymentInstructions", '(\+?263[ -]?|0)7[ -]?7[ -]?5[ -]?1[ -]?0[ -]?1[ -]?5[ -]?0[ -]?6', '+263 71 995 6882', 'g')
WHERE "description" ~ '7[ -]?7[ -]?5[ -]?1[ -]?0[ -]?1[ -]?5[ -]?0[ -]?6'
   OR "tagline" ~ '7[ -]?7[ -]?5[ -]?1[ -]?0[ -]?1[ -]?5[ -]?0[ -]?6'
   OR "paymentInstructions" ~ '7[ -]?7[ -]?5[ -]?1[ -]?0[ -]?1[ -]?5[ -]?0[ -]?6';
