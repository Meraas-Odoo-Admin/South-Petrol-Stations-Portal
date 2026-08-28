-- CreateEnum
CREATE TYPE "VehicleChangeType" AS ENUM ('CHASSIS_CHANGE', 'BOOKLET_CHANGE');

-- CreateEnum
CREATE TYPE "VehicleChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "registrationBooklet" TEXT;

-- CreateTable
CREATE TABLE "VehicleChassisHistory" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "chassisNumber" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "VehicleChassisHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleBookletHistory" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "registrationBooklet" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),

    CONSTRAINT "VehicleBookletHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleChangeRequest" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "changeType" "VehicleChangeType" NOT NULL,
    "currentValue" TEXT NOT NULL,
    "requestedValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proofReference" TEXT NOT NULL,
    "status" "VehicleChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleChassisHistory_vehicleId_idx" ON "VehicleChassisHistory"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleBookletHistory_vehicleId_idx" ON "VehicleBookletHistory"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleChangeRequest_vehicleId_idx" ON "VehicleChangeRequest"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_registrationBooklet_key" ON "Vehicle"("registrationBooklet");

-- AddForeignKey
ALTER TABLE "VehicleChassisHistory" ADD CONSTRAINT "VehicleChassisHistory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleBookletHistory" ADD CONSTRAINT "VehicleBookletHistory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleChangeRequest" ADD CONSTRAINT "VehicleChangeRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleChangeRequest" ADD CONSTRAINT "VehicleChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleChangeRequest" ADD CONSTRAINT "VehicleChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

