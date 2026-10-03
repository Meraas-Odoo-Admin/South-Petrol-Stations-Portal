-- Registration pivot, phase 2: record where and by whom each vehicle was
-- registered. Additive only: two new nullable columns (existing vehicles
-- predate registration stations and stay NULL) and their foreign keys.

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "registeredAtRegistrationStationId" TEXT,
ADD COLUMN     "registeredById" TEXT;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_registeredAtRegistrationStationId_fkey" FOREIGN KEY ("registeredAtRegistrationStationId") REFERENCES "RegistrationStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
