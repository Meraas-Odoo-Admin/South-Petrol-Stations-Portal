-- After review (19 Oct 2026): the audit log is insert-only in the database
-- itself, like the stock tables — not only by the application's habit. No row
-- is ever changed or deleted, and the table is never emptied. Two narrow,
-- deliberate exceptions:
--  - an account deleted later (test accounts) keeps its entries, which only
--    lose the link to it (the foreign key's ON DELETE SET NULL): an UPDATE
--    that changes "userId" to NULL and nothing else;
--  - removing test data, inside one transaction that has set
--    app.test_data_removal = 'on' (src/golive/removal.ts, and the test suites'
--    clean-up through prisma/audit-removal.ts). SET LOCAL ends with the
--    transaction.
CREATE FUNCTION "audit_log_insert_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."userId" IS NOT NULL AND NEW."userId" IS NULL
     AND NEW."id" = OLD."id"
     AND NEW."action" = OLD."action"
     AND NEW."entityType" = OLD."entityType"
     AND NEW."entityId" = OLD."entityId"
     AND NEW."oldValue" IS NOT DISTINCT FROM OLD."oldValue"
     AND NEW."newValue" IS NOT DISTINCT FROM OLD."newValue"
     AND NEW."ipAddress" IS NOT DISTINCT FROM OLD."ipAddress"
     AND NEW."userAgent" IS NOT DISTINCT FROM OLD."userAgent"
     AND NEW."createdAt" = OLD."createdAt" THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND current_setting('app.test_data_removal', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditLog is insert-only: an audit entry is never changed or deleted.';
END;
$$;
CREATE TRIGGER "audit_log_no_update_delete" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_insert_only"();
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_insert_only"();
