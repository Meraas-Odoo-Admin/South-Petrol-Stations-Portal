-- After review (19 Oct 2026): a plate number may belong to more than one
-- vehicle, as long as each has its own chassis number (which stays unique).
-- No data changes: the unique constraint becomes a plain index for search.
DROP INDEX IF EXISTS "Vehicle_currentPlate_key";
CREATE INDEX IF NOT EXISTS "Vehicle_currentPlate_idx" ON "Vehicle"("currentPlate");
