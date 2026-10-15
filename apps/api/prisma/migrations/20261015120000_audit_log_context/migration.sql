-- After review (15 Oct 2026): a richer audit log. Additive only.
-- The device (browser and system) each entry came from, beside its address.
ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT;

-- The log screen filters by date and by action, newest first.
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
