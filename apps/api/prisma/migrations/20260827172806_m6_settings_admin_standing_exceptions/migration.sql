-- AlterTable
ALTER TABLE "Exception" ADD COLUMN     "triggerDetail" JSONB,
ADD COLUMN     "triggerReason" TEXT;

-- AlterTable
ALTER TABLE "FillUpTransaction" ADD COLUMN     "coveredRule" TEXT,
ADD COLUMN     "standingExceptionId" TEXT;

-- CreateTable
CREATE TABLE "StandingException" (
    "id" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "rules" TEXT[],
    "reason" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "StandingException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StandingException_driverId_idx" ON "StandingException"("driverId");

-- CreateIndex
CREATE INDEX "StandingException_vehicleId_idx" ON "StandingException"("vehicleId");

-- AddForeignKey
ALTER TABLE "FillUpTransaction" ADD CONSTRAINT "FillUpTransaction_standingExceptionId_fkey" FOREIGN KEY ("standingExceptionId") REFERENCES "StandingException"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingException" ADD CONSTRAINT "StandingException_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingException" ADD CONSTRAINT "StandingException_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingException" ADD CONSTRAINT "StandingException_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingException" ADD CONSTRAINT "StandingException_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

