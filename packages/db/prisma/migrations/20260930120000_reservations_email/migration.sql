-- Route reservations to reservations@forestcreek.co.zw. The earlier
-- real-lodge-contacts migration pointed the property contact at
-- admin@forestcreek.co.zw; the team confirmed reservations@ is the single
-- address the site and staff booking emails use.
--
-- Scoped to the exact previous value: anything a manager has already edited in
-- the dashboard is left alone.
UPDATE "property"
SET "email" = 'reservations@forestcreek.co.zw'
WHERE "email" = 'admin@forestcreek.co.zw';
