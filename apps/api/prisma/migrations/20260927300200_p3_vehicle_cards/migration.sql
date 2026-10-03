-- Registration pivot, phase 3: the printed vehicle card. Additive: one new
-- table, two new enums.

-- CreateEnum
CREATE TYPE "VehicleCardIssueReason" AS ENUM ('FIRST_ISSUE', 'LOST', 'DAMAGED', 'FAILED_PRINT', 'DETAILS_CHANGED');

-- CreateEnum
CREATE TYPE "VehicleCardStatus" AS ENUM ('ACTIVE', 'REPLACED', 'CANCELLED');

-- CreateTable
CREATE TABLE "VehicleCard" (
    "id" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "registrationStationId" TEXT NOT NULL,
    "deskId" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "VehicleCardIssueReason" NOT NULL,
    "reasonNote" TEXT,
    "status" "VehicleCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeForVehicleId" TEXT,
    "replacedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "printedPlate" TEXT NOT NULL,
    "printedVehicleLine" TEXT NOT NULL,
    "printedOfficeName" TEXT NOT NULL,
    "printedIssueDate" TEXT NOT NULL,
    "printedStationCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleCard_pkey" PRIMARY KEY ("id"),
    -- One active card per vehicle, enforced by the database: an ACTIVE card
    -- carries its vehicleId in activeForVehicleId (unique below), any other
    -- status carries NULL. This CHECK keeps the two columns from disagreeing.
    CONSTRAINT "VehicleCard_active_marker_check" CHECK (
      ("status" = 'ACTIVE' AND "activeForVehicleId" = "vehicleId")
      OR ("status" <> 'ACTIVE' AND "activeForVehicleId" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCard_cardNumber_key" ON "VehicleCard"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleCard_activeForVehicleId_key" ON "VehicleCard"("activeForVehicleId");

-- CreateIndex
CREATE INDEX "VehicleCard_vehicleId_issuedAt_idx" ON "VehicleCard"("vehicleId", "issuedAt");

-- AddForeignKey
ALTER TABLE "VehicleCard" ADD CONSTRAINT "VehicleCard_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCard" ADD CONSTRAINT "VehicleCard_registrationStationId_fkey" FOREIGN KEY ("registrationStationId") REFERENCES "RegistrationStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCard" ADD CONSTRAINT "VehicleCard_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "RegistrationDesk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCard" ADD CONSTRAINT "VehicleCard_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCard" ADD CONSTRAINT "VehicleCard_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
