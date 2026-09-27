-- Registration pivot, phase 1 §3: stamp every fill-up with the
-- municipality it happened in. Additive only: a new nullable column, a
-- foreign key, and a new index next to the existing (vehicleId, occurredAt).

-- AlterTable
ALTER TABLE "FillUpTransaction" ADD COLUMN     "municipalityId" TEXT;

-- CreateIndex
CREATE INDEX "FillUpTransaction_vehicleId_municipalityId_occurredAt_idx" ON "FillUpTransaction"("vehicleId", "municipalityId", "occurredAt");

-- AddForeignKey
ALTER TABLE "FillUpTransaction" ADD CONSTRAINT "FillUpTransaction_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing (pre-go-live test) fill-ups from their station's
-- current municipality. Rows at a station with no municipality stay NULL;
-- the app never creates new ones like that.
UPDATE "FillUpTransaction" f
SET "municipalityId" = s."municipalityId"
FROM "Station" s
WHERE f."stationId" = s."id"
  AND f."municipalityId" IS NULL
  AND s."municipalityId" IS NOT NULL;
