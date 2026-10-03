-- Registration pivot, phase 3: a short code per municipality, used as the
-- card-number prefix (SBH-7K2M9Q4X). Additive: one new nullable column and
-- a unique index.

-- AlterTable
ALTER TABLE "Municipality" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_code_key" ON "Municipality"("code");

-- Backfill: سبها → SBH. Other municipalities stay NULL until an admin sets
-- one (no card can be issued in a municipality without a code).
UPDATE "Municipality" SET "code" = 'SBH' WHERE "name" = 'سبها' AND "code" IS NULL;
