-- Round 6: fill-ups no longer require driver identity — see
-- docs/DESIGN_owner_based_fillups.md. VehicleOwner gains the same
-- (identityType, identityNumber) shape Driver already has; driverId
-- becomes nullable/legacy on FillUpTransaction; StandingException's scope
-- re-points from Driver to VehicleOwner.

-- ── VehicleOwner: identityType/identityNumber replace nationalId ──────
ALTER TABLE "VehicleOwner" ADD COLUMN "identityType" "IdentityType";
ALTER TABLE "VehicleOwner" ADD COLUMN "identityNumber" TEXT;

-- Backfill existing rows: nationalId was always a national-ID-shaped value
-- in practice (no ADMINISTRATIVE_ID owners existed before this column
-- split), so NATIONAL_ID is the correct default for every existing row.
UPDATE "VehicleOwner" SET "identityType" = 'NATIONAL_ID', "identityNumber" = "nationalId" WHERE "nationalId" IS NOT NULL;
-- Any owner row that somehow had no nationalId gets a placeholder that is
-- guaranteed unique (its own id) rather than silently colliding with a
-- future real value — flagged via the placeholder shape itself.
UPDATE "VehicleOwner" SET "identityType" = 'NATIONAL_ID', "identityNumber" = 'UNKNOWN-' || "id" WHERE "identityNumber" IS NULL;

ALTER TABLE "VehicleOwner" ALTER COLUMN "identityType" SET NOT NULL;
ALTER TABLE "VehicleOwner" ALTER COLUMN "identityNumber" SET NOT NULL;
ALTER TABLE "VehicleOwner" DROP COLUMN "nationalId";

CREATE UNIQUE INDEX "VehicleOwner_identityType_identityNumber_key" ON "VehicleOwner"("identityType", "identityNumber");

-- ── FillUpTransaction.driverId becomes nullable ────────────────────────
ALTER TABLE "FillUpTransaction" ALTER COLUMN "driverId" DROP NOT NULL;

-- ── StandingException: driverId -> ownerId (Driver -> VehicleOwner) ───
ALTER TABLE "StandingException" DROP CONSTRAINT "StandingException_driverId_fkey";
DROP INDEX "StandingException_driverId_idx";
ALTER TABLE "StandingException" RENAME COLUMN "driverId" TO "ownerId";
CREATE INDEX "StandingException_ownerId_idx" ON "StandingException"("ownerId");
ALTER TABLE "StandingException" ADD CONSTRAINT "StandingException_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "VehicleOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
