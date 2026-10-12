-- CreateEnum
CREATE TYPE "CardPrintKind" AS ENUM ('CARD', 'TEST');

-- CreateEnum
CREATE TYPE "StockEntryKind" AS ENUM ('RECEIVED', 'COUNT', 'CORRECTION');

-- CreateTable
CREATE TABLE "CardPrint" (
    "id" TEXT NOT NULL,
    "registrationStationId" TEXT NOT NULL,
    "deskId" TEXT NOT NULL,
    "kind" "CardPrintKind" NOT NULL,
    "cardId" TEXT,
    "printedById" TEXT NOT NULL,
    "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPrint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" TEXT NOT NULL,
    "registrationStationId" TEXT NOT NULL,
    "deskId" TEXT,
    "kind" "StockEntryKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "correctsEntryId" TEXT,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCatch" (
    "id" TEXT NOT NULL,
    "registrationStationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fields" TEXT[],
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateCatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardPrint_registrationStationId_printedAt_idx" ON "CardPrint"("registrationStationId", "printedAt");

-- CreateIndex
CREATE INDEX "CardPrint_deskId_printedAt_idx" ON "CardPrint"("deskId", "printedAt");

-- CreateIndex
CREATE INDEX "CardPrint_printedById_printedAt_idx" ON "CardPrint"("printedById", "printedAt");

-- CreateIndex
CREATE INDEX "StockEntry_registrationStationId_occurredAt_idx" ON "StockEntry"("registrationStationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockEntry_correctsEntryId_idx" ON "StockEntry"("correctsEntryId");

-- CreateIndex
CREATE INDEX "DuplicateCatch_registrationStationId_occurredAt_idx" ON "DuplicateCatch"("registrationStationId", "occurredAt");

-- CreateIndex
CREATE INDEX "DuplicateCatch_userId_occurredAt_idx" ON "DuplicateCatch"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "FillUpTransaction_municipalityId_occurredAt_stationId_idx" ON "FillUpTransaction"("municipalityId", "occurredAt", "stationId");

-- CreateIndex
CREATE INDEX "OwnerChangeRequest_requestedById_createdAt_idx" ON "OwnerChangeRequest"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_registeredAtRegistrationStationId_createdAt_idx" ON "Vehicle"("registeredAtRegistrationStationId", "createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_registeredById_createdAt_idx" ON "Vehicle"("registeredById", "createdAt");

-- CreateIndex
CREATE INDEX "VehicleCard_registrationStationId_issuedAt_idx" ON "VehicleCard"("registrationStationId", "issuedAt");

-- CreateIndex
CREATE INDEX "VehicleCard_issuedById_issuedAt_idx" ON "VehicleCard"("issuedById", "issuedAt");

-- CreateIndex
CREATE INDEX "VehicleChangeRequest_requestedById_createdAt_idx" ON "VehicleChangeRequest"("requestedById", "createdAt");

-- AddForeignKey
ALTER TABLE "CardPrint" ADD CONSTRAINT "CardPrint_registrationStationId_fkey" FOREIGN KEY ("registrationStationId") REFERENCES "RegistrationStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPrint" ADD CONSTRAINT "CardPrint_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "RegistrationDesk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPrint" ADD CONSTRAINT "CardPrint_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_registrationStationId_fkey" FOREIGN KEY ("registrationStationId") REFERENCES "RegistrationStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "RegistrationDesk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_correctsEntryId_fkey" FOREIGN KEY ("correctsEntryId") REFERENCES "StockEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCatch" ADD CONSTRAINT "DuplicateCatch_registrationStationId_fkey" FOREIGN KEY ("registrationStationId") REFERENCES "RegistrationStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCatch" ADD CONSTRAINT "DuplicateCatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Phase 4c, hand-written part ───────────────────────────────────────

-- StockEntry rules, enforced by the database as well as the API:
--  * a count or delivery is never negative;
--  * only a CORRECTION points at another entry, and it must say why.
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_correction_links" CHECK (("kind" = 'CORRECTION') = ("correctsEntryId" IS NOT NULL));
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_correction_has_reason" CHECK ("kind" <> 'CORRECTION' OR ("reason" IS NOT NULL AND length(btrim("reason")) > 0));

-- Insert-only: no row is ever edited or deleted. A mistake is a new CORRECTION entry.
CREATE FUNCTION "stock_entry_insert_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'StockEntry is insert-only: record a CORRECTION entry instead of changing or deleting one.';
END;
$$;
CREATE TRIGGER "stock_entry_no_update_delete" BEFORE UPDATE OR DELETE ON "StockEntry"
  FOR EACH ROW EXECUTE FUNCTION "stock_entry_insert_only"();
CREATE TRIGGER "stock_entry_no_truncate" BEFORE TRUNCATE ON "StockEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION "stock_entry_insert_only"();

-- What counted as a print before this phase: every card or reprint PDF
-- printed, recorded as a PRINT_CARD audit row. Copy those real events into
-- CardPrint so the history is not lost and nothing is invented. Test-card
-- prints were not recorded at all before this phase, so none are added.
INSERT INTO "CardPrint" ("id", "registrationStationId", "deskId", "kind", "cardId", "printedById", "printedAt")
SELECT 'bf_' || md5(a."id"), c."registrationStationId", c."deskId", 'CARD', c."id", a."userId", a."createdAt"
FROM "AuditLog" a
JOIN "VehicleCard" c ON c."id" = a."entityId"
WHERE a."action" = 'PRINT_CARD' AND a."entityType" = 'VehicleCard' AND a."userId" IS NOT NULL;
