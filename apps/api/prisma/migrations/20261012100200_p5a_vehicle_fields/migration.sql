-- Phase 5A: vehicle fields. Additive columns, plus one backfill:
-- before 5A the single "model" column held the manufacturer chosen from a
-- list. It is copied into the new "make" column and cleared from "model", so a
-- vehicle's printed "make - colour" line (and with it every issued card's
-- "needs reissue" comparison) reads exactly as before.

-- CreateEnum
CREATE TYPE "VehicleFuelType" AS ENUM ('PETROL', 'DIESEL');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "chassisNonStandard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fuelType" "VehicleFuelType",
ADD COLUMN     "make" TEXT;

-- AlterTable
ALTER TABLE "FillUpTransaction" ADD COLUMN     "fuelMismatch" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: the old manufacturer value moves to "make".
UPDATE "Vehicle" SET "make" = "model", "model" = NULL WHERE "make" IS NULL AND "model" IS NOT NULL;
