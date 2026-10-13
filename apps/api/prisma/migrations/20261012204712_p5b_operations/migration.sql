-- CreateEnum
CREATE TYPE "FuelStockEntryKind" AS ENUM ('DELIVERY', 'CORRECTION', 'RESET');

-- AlterTable
ALTER TABLE "Station" ADD COLUMN     "showStockToEmployees" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "StationFuelStorage" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "capacityLiters" DECIMAL(65,30) NOT NULL,
    "openingLevelLiters" DECIMAL(65,30) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lowStockAlerted" BOOLEAN NOT NULL DEFAULT false,
    "negativeAlerted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StationFuelStorage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelStockEntry" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "kind" "FuelStockEntryKind" NOT NULL,
    "liters" DECIMAL(65,30) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "truckPlate" TEXT,
    "waybillNumber" TEXT,
    "driverName" TEXT,
    "correctsEntryId" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelStockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StationFuelStorage_stationId_fuelType_key" ON "StationFuelStorage"("stationId", "fuelType");

-- CreateIndex
CREATE INDEX "FuelStockEntry_stationId_fuelType_occurredAt_idx" ON "FuelStockEntry"("stationId", "fuelType", "occurredAt");

-- CreateIndex
CREATE INDEX "FuelStockEntry_correctsEntryId_idx" ON "FuelStockEntry"("correctsEntryId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "StationFuelStorage" ADD CONSTRAINT "StationFuelStorage_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelStockEntry" ADD CONSTRAINT "FuelStockEntry_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelStockEntry" ADD CONSTRAINT "FuelStockEntry_correctsEntryId_fkey" FOREIGN KEY ("correctsEntryId") REFERENCES "FuelStockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelStockEntry" ADD CONSTRAINT "FuelStockEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Phase 5B, hand-written part ───────────────────────────────────────

-- Fuel stock entries: liters are never negative; only a CORRECTION points at
-- another entry (and must say why); a RESET must say why too.
ALTER TABLE "FuelStockEntry" ADD CONSTRAINT "FuelStockEntry_liters_nonnegative" CHECK ("liters" >= 0);
ALTER TABLE "FuelStockEntry" ADD CONSTRAINT "FuelStockEntry_correction_links" CHECK (("kind" = 'CORRECTION') = ("correctsEntryId" IS NOT NULL));
ALTER TABLE "FuelStockEntry" ADD CONSTRAINT "FuelStockEntry_correction_has_reason" CHECK ("kind" = 'DELIVERY' OR ("reason" IS NOT NULL AND length(btrim("reason")) > 0));
ALTER TABLE "StationFuelStorage" ADD CONSTRAINT "StationFuelStorage_capacity_positive" CHECK ("capacityLiters" > 0);
ALTER TABLE "StationFuelStorage" ADD CONSTRAINT "StationFuelStorage_opening_nonnegative" CHECK ("openingLevelLiters" >= 0);

-- Insert-only, like card stock: no entry is ever edited or deleted.
CREATE FUNCTION "fuel_stock_entry_insert_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FuelStockEntry is insert-only: record a CORRECTION entry instead of changing or deleting one.';
END;
$$;
CREATE TRIGGER "fuel_stock_entry_no_update_delete" BEFORE UPDATE OR DELETE ON "FuelStockEntry"
  FOR EACH ROW EXECUTE FUNCTION "fuel_stock_entry_insert_only"();
CREATE TRIGGER "fuel_stock_entry_no_truncate" BEFORE TRUNCATE ON "FuelStockEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION "fuel_stock_entry_insert_only"();

-- Two settings only the super admin changes. ON CONFLICT DO NOTHING: a value
-- already set is never overwritten.
INSERT INTO "SystemSetting" ("key", "value", "description", "updatedAt") VALUES
  ('stock.low_threshold_liters', '1000', 'Low-stock alert: a fuel type at a station below this many liters notifies the supervisor and the municipality managers', NOW()),
  ('cards.low_blank_threshold', '100', 'PLACEHOLDER: low blank-card stock alert: an office below this many blank cards notifies its manager (the client has not given a number)', NOW())
ON CONFLICT ("key") DO NOTHING;
