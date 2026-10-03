-- Registration pivot, phase 3: desks (and their card printers) at each
-- registration station. Additive: one new table.

-- CreateTable
CREATE TABLE "RegistrationDesk" (
    "id" TEXT NOT NULL,
    "registrationStationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "printerModel" TEXT,
    "printerSerial" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationDesk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationDesk_registrationStationId_name_key" ON "RegistrationDesk"("registrationStationId", "name");

-- AddForeignKey
ALTER TABLE "RegistrationDesk" ADD CONSTRAINT "RegistrationDesk_registrationStationId_fkey" FOREIGN KEY ("registrationStationId") REFERENCES "RegistrationStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
