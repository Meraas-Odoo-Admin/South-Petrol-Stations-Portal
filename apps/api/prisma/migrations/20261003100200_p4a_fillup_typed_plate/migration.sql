-- Registration pivot, phase 4a: fill-ups for a plate with no registered
-- vehicle, and a record of how every fill-up identified its vehicle.
-- Additive: relaxes one NOT NULL (FillUpTransaction.vehicleId), adds
-- nullable columns, one enum, one CHECK, one index. No row is dropped or
-- rewritten except the identifiedBy backfill below.

CREATE TYPE "FillUpIdentification" AS ENUM (
  'CARD_SCAN',
  'TYPED_REGISTERED',
  'TYPED_UNREGISTERED',
  'EMERGENCY_OVERRIDE'
);

ALTER TABLE "FillUpTransaction" ALTER COLUMN "vehicleId" DROP NOT NULL;

ALTER TABLE "FillUpTransaction"
  ADD COLUMN "typedPlate" TEXT,
  ADD COLUMN "normalizedPlate" TEXT,
  ADD COLUMN "identifiedBy" "FillUpIdentification",
  ADD COLUMN "overrideReason" TEXT;

-- Backfill: every existing row has a vehicle, and before this phase the
-- only ways to pick one were typing/searching its plate or (Phase 3) a card
-- scan — which wasn't recorded. No card existed before Phase 3 and no real
-- (non-test) fill-up exists yet, so every existing row is marked
-- TYPED_REGISTERED; a Phase 3 test fill-up made by scanning is
-- indistinguishable and will read as typed.
UPDATE "FillUpTransaction" SET "identifiedBy" = 'TYPED_REGISTERED';

ALTER TABLE "FillUpTransaction" ALTER COLUMN "identifiedBy" SET NOT NULL;

-- Every fill-up has a vehicle, or the plate that was typed (and its
-- normalized form, which the by-plate allowance counts key on).
ALTER TABLE "FillUpTransaction"
  ADD CONSTRAINT "FillUpTransaction_has_subject"
  CHECK (
    "vehicleId" IS NOT NULL
    OR ("typedPlate" IS NOT NULL AND "normalizedPlate" IS NOT NULL)
  );

-- By-plate history per municipality (the unregistered-plate allowance query).
CREATE INDEX "FillUpTransaction_municipalityId_normalizedPlate_occurredAt_idx"
  ON "FillUpTransaction"("municipalityId", "normalizedPlate", "occurredAt");
