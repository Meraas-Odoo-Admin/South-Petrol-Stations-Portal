-- Phase 5C: a station and a fill-up must have a municipality.
--
-- This is a CONSTRAINT TIGHTENING, not an additive change: it makes two
-- existing nullable columns NOT NULL. It is guarded: the first statement
-- counts the rows that would break it and stops the whole migration, with a
-- message saying what to fix, before anything is altered. (Migrations run in
-- one transaction, so a stop leaves the database exactly as it was.)
--
-- To clear the nulls: stations:import for Sabha's stations, then
-- stations:clean-non-sabha (or golive:clean) for stations and fill-ups that
-- belong to no municipality.

DO $$
DECLARE
  stations_without bigint;
  fillups_without bigint;
BEGIN
  SELECT count(*) INTO stations_without FROM "Station" WHERE "municipalityId" IS NULL;
  SELECT count(*) INTO fillups_without FROM "FillUpTransaction" WHERE "municipalityId" IS NULL;
  IF stations_without > 0 OR fillups_without > 0 THEN
    RAISE EXCEPTION
      'Cannot make municipalityId required: % station(s) and % fill-up(s) have no municipality. Import or clean them first (stations:import, then stations:clean-non-sabha), then run the migration again.',
      stations_without, fillups_without;
  END IF;
END
$$;

-- DropForeignKey
ALTER TABLE "FillUpTransaction" DROP CONSTRAINT "FillUpTransaction_municipalityId_fkey";

-- DropForeignKey
ALTER TABLE "Station" DROP CONSTRAINT "Station_municipalityId_fkey";

-- AlterTable
ALTER TABLE "FillUpTransaction" ALTER COLUMN "municipalityId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Station" ALTER COLUMN "municipalityId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillUpTransaction" ADD CONSTRAINT "FillUpTransaction_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
