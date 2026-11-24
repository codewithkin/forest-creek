-- Forest Creek's printed Restaurant & Bar menu (photographed 24 Nov 2026), so
-- the website, the printable menu and the Guide have it from the first deploy.
-- Only for the main lodge (slug "main" live, "forest-creek" in a seeded dev
-- database), and only when it has no menu yet: staff edits are never touched.
-- Items the card prints without a price show "Ask" (priceCents NULL).
-- Breakfast leads, empty, for the team to fill in.
DO $$
DECLARE
  pid TEXT;
  sid TEXT;
  section_order INT := 0;
  rec RECORD;
BEGIN
  SELECT id INTO pid FROM "property" WHERE slug IN ('main', 'forest-creek') ORDER BY (slug = 'main') DESC LIMIT 1;
  IF pid IS NULL OR EXISTS (SELECT 1 FROM "menu_section" WHERE "propertyId" = pid) THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      (1, 'Breakfast', 'food', 'Served 7 to 10am'),
      (2, 'Mains & Grills', 'food', NULL),
      (3, 'Sides', 'food', NULL),
      (4, 'Kids Corner', 'food', NULL),
      (5, 'Desserts', 'food', NULL),
      (6, 'Craft Shakes', 'bar', NULL),
      (7, 'Mocktails', 'bar', NULL),
      (8, 'Hot Beverages', 'bar', NULL),
      (9, 'Cold Beverages', 'bar', NULL)
    ) AS sections(position, name, kind, note)
    ORDER BY position
  LOOP
    sid := gen_random_uuid()::text;
    INSERT INTO "menu_section" ("id", "propertyId", "name", "kind", "note", "sortOrder", "active", "updatedAt")
    VALUES (sid, pid, rec.name, rec.kind, rec.note, section_order, true, CURRENT_TIMESTAMP);
    section_order := section_order + 1;

    INSERT INTO "menu_item" ("id", "sectionId", "name", "priceCents", "sortOrder", "updatedAt")
    SELECT gen_random_uuid()::text, sid, items.name, items.price, items.position, CURRENT_TIMESTAMP
    FROM (VALUES
      ('Mains & Grills', 0, '¼ Chicken', 800),
      ('Mains & Grills', 1, 'Beef Burger', 800),
      ('Mains & Grills', 2, 'Beef Stew', 800),
      ('Mains & Grills', 3, 'Pork Chop', 1200),
      ('Mains & Grills', 4, 'Sirloin Steak (300g)', 1200),
      ('Mains & Grills', 5, 'Sirloin Steak (500g)', 1600),
      ('Mains & Grills', 6, 'Rump Steak (300g)', 1400),
      ('Mains & Grills', 7, 'Rump Steak (500g)', 1800),
      ('Mains & Grills', 8, 'King Prawns', 1800),
      ('Sides', 0, 'Rice', 200),
      ('Sides', 1, 'Mash', 200),
      ('Sides', 2, 'Plain Sadza', 200),
      ('Sides', 3, 'Zviyo Sadza', 200),
      ('Sides', 4, 'Chips', 200),
      ('Sides', 5, 'Roast Potatoes', 200),
      ('Sides', 6, 'Garden Salad', 200),
      ('Sides', 7, 'Coleslaw', 100),
      ('Kids Corner', 0, 'Pancakes (Nutella / Syrup)', 500),
      ('Kids Corner', 1, 'Mac & Cheese', 500),
      ('Kids Corner', 2, 'Eggs on Toast', 300),
      ('Desserts', 0, 'Sticky Toffee Pudding', NULL),
      ('Desserts', 1, 'Ice Cream', NULL),
      ('Craft Shakes', 0, 'Double Choc Shake', NULL),
      ('Craft Shakes', 1, 'Chocolate / Bar One / Bubblegum', NULL),
      ('Craft Shakes', 2, 'Salted Caramel', NULL),
      ('Craft Shakes', 3, 'Vanilla / Strawberry', NULL),
      ('Craft Shakes', 4, 'Extra Double Thick', NULL),
      ('Mocktails', 0, 'Creek Sunset Cooler', NULL),
      ('Mocktails', 1, 'Mojito', NULL),
      ('Mocktails', 2, 'Vumba Refresher', NULL),
      ('Mocktails', 3, 'Tropical Punch', NULL),
      ('Mocktails', 4, 'Piña Colada', NULL),
      ('Hot Beverages', 0, 'Hot Chocolate', NULL),
      ('Hot Beverages', 1, 'Coffee', NULL),
      ('Hot Beverages', 2, 'Specialty Teas', NULL),
      ('Hot Beverages', 3, 'Tanganda Tea / Rooibos', NULL),
      ('Cold Beverages', 0, 'Fruit Juices', NULL),
      ('Cold Beverages', 1, 'Uber Soda', NULL),
      ('Cold Beverages', 2, 'Cuppy', NULL),
      ('Cold Beverages', 3, 'Cascade', NULL),
      ('Cold Beverages', 4, 'Sting', NULL),
      ('Cold Beverages', 5, 'Twist Soft Drink', NULL)
    ) AS items(section, position, name, price)
    WHERE items.section = rec.name;
  END LOOP;
END $$;
