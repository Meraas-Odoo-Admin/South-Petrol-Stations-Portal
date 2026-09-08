-- AlterEnum
ALTER TYPE "IdentityType" ADD VALUE 'DRIVERS_LICENSE';

-- DropForeignKey
ALTER TABLE "FillUpTransaction" DROP CONSTRAINT "FillUpTransaction_driverId_fkey";

-- AddForeignKey
ALTER TABLE "FillUpTransaction" ADD CONSTRAINT "FillUpTransaction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
