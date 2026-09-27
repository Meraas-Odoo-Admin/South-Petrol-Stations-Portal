-- Registration pivot, phase 1 §2: a municipality is either PREPARING
-- (admin-only) or LIVE. Additive only: a new enum and a new column with a
-- default. Municipality."isActive" is superseded but not dropped.

-- CreateEnum
CREATE TYPE "MunicipalityStatus" AS ENUM ('PREPARING', 'LIVE');

-- AlterTable
ALTER TABLE "Municipality" ADD COLUMN     "status" "MunicipalityStatus" NOT NULL DEFAULT 'PREPARING';

-- Backfill: سبها is live. Every other existing municipality row is left in
-- place and starts PREPARING — removing non-Sabha data is a later phase,
-- waiting on the client's list of which place names fall inside Sabha.
UPDATE "Municipality" SET "status" = 'LIVE' WHERE "name" = 'سبها';
