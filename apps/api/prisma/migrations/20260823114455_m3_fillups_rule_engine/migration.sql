-- CreateTable
CREATE TABLE "FillUpTransaction" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "quantityLiters" DECIMAL(65,30) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FillUpTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresProof" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExceptionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "fillUpTransactionId" TEXT NOT NULL,
    "exceptionTypeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" TEXT,
    "proofReference" TEXT,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FillUpTransaction_idempotencyKey_key" ON "FillUpTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FillUpTransaction_vehicleId_occurredAt_idx" ON "FillUpTransaction"("vehicleId", "occurredAt");

-- CreateIndex
CREATE INDEX "FillUpTransaction_driverId_occurredAt_idx" ON "FillUpTransaction"("driverId", "occurredAt");

-- CreateIndex
CREATE INDEX "FillUpTransaction_stationId_occurredAt_idx" ON "FillUpTransaction"("stationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExceptionType_key_key" ON "ExceptionType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Exception_fillUpTransactionId_key" ON "Exception"("fillUpTransactionId");

-- AddForeignKey
ALTER TABLE "FillUpTransaction" ADD CONSTRAINT "FillUpTransaction_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillUpTransaction" ADD CONSTRAINT "FillUpTransaction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillUpTransaction" ADD CONSTRAINT "FillUpTransaction_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FillUpTransaction" ADD CONSTRAINT "FillUpTransaction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_fillUpTransactionId_fkey" FOREIGN KEY ("fillUpTransactionId") REFERENCES "FillUpTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_exceptionTypeId_fkey" FOREIGN KEY ("exceptionTypeId") REFERENCES "ExceptionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
