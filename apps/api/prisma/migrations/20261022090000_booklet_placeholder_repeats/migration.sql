-- After review (22 Oct 2026): the booklet number '000000' stands for an
-- unknown booklet and may belong to many vehicles; every other booklet number
-- stays unique. No data changes: the unique constraint becomes a partial
-- unique index (which also serves the look-ups by booklet number).
DROP INDEX IF EXISTS "Vehicle_registrationBooklet_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_registrationBooklet_unique"
  ON "Vehicle"("registrationBooklet")
  WHERE "registrationBooklet" <> '000000';
