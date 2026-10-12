-- Phase 5A: institution-owned vehicles. All additive: a new enum value, a new
-- enum, and nullable / defaulted columns. The DRIVERS_LICENSE value stays in
-- IdentityType so existing rows keep reading; nothing creates it any more.

-- AlterEnum
ALTER TYPE "IdentityType" ADD VALUE 'INSTITUTION';

-- CreateEnum
CREATE TYPE "OwnerKind" AS ENUM ('INDIVIDUAL', 'INSTITUTION');

-- AlterTable
ALTER TABLE "VehicleOwner" ADD COLUMN     "institutionNameKey" TEXT,
ADD COLUMN     "ownerKind" "OwnerKind" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "responsibleDriverName" TEXT,
ADD COLUMN     "responsibleDriverNationalId" TEXT,
ADD COLUMN     "responsibleDriverPhone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "VehicleOwner_institutionNameKey_key" ON "VehicleOwner"("institutionNameKey");
