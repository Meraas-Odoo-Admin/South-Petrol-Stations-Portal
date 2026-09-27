-- Registration pivot, phase 1 §1: one security authority per municipality
-- (client-confirmed; docs/OPEN_ITEMS.md #4). Additive only: a new nullable
-- column plus a unique index. Station."securityAuthorityId" is left in
-- place (no longer written) rather than dropped.

-- AlterTable
ALTER TABLE "SecurityAuthority" ADD COLUMN     "municipalityId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SecurityAuthority_municipalityId_key" ON "SecurityAuthority"("municipalityId");

-- AddForeignKey
ALTER TABLE "SecurityAuthority" ADD CONSTRAINT "SecurityAuthority_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: مديرية أمن سبها -> سبها. A no-op on a database where either
-- row doesn't exist yet (e.g. a fresh production bootstrap, which creates
-- both already linked).
UPDATE "SecurityAuthority" sa
SET "municipalityId" = m."id"
FROM "Municipality" m
WHERE sa."name" = 'مديرية أمن سبها'
  AND m."name" = 'سبها'
  AND sa."municipalityId" IS NULL;
