-- Registration pivot, phase 2: registration stations (police-station
-- registration desks) and the user-to-registration-station scope table.
-- Additive only: two new tables and a new enum; nothing existing changes.

-- CreateEnum
CREATE TYPE "RegistrationStationStatus" AS ENUM ('ACTIVE', 'TEMPORARILY_CLOSED', 'CLOSED');

-- CreateTable
CREATE TABLE "RegistrationStation" (
    "id" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "officialCode" TEXT,
    "name" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "contactPhone" TEXT,
    "workingHours" TEXT,
    "status" "RegistrationStationStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRegistrationStationScope" (
    "userId" TEXT NOT NULL,
    "registrationStationId" TEXT NOT NULL,

    CONSTRAINT "UserRegistrationStationScope_pkey" PRIMARY KEY ("userId","registrationStationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationStation_internalCode_key" ON "RegistrationStation"("internalCode");

-- AddForeignKey
ALTER TABLE "RegistrationStation" ADD CONSTRAINT "RegistrationStation_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRegistrationStationScope" ADD CONSTRAINT "UserRegistrationStationScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRegistrationStationScope" ADD CONSTRAINT "UserRegistrationStationScope_registrationStationId_fkey" FOREIGN KEY ("registrationStationId") REFERENCES "RegistrationStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
