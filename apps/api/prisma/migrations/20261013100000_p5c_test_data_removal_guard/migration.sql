-- Phase 5C: the one controlled way test rows leave the insert-only stock tables.
--
-- StockEntry and FuelStockEntry stay insert-only for the app and for every SQL
-- statement: UPDATE and TRUNCATE are always refused, and DELETE is refused
-- unless the surrounding transaction has set app.test_data_removal = 'on'
-- (SET LOCAL semantics: set_config(..., true) ends with the transaction).
-- Only the golive:clean / stations:clean-non-sabha commands set it, to remove
-- TEST rows before real use. The triggers themselves are not dropped or
-- disabled; the functions are replaced in place, so nothing is ever left
-- unguarded between two statements.
--
-- This is a new migration, not an edit of the 4c / 5B ones (CLAUDE.md rule 11).

CREATE OR REPLACE FUNCTION "stock_entry_insert_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.test_data_removal', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'StockEntry is insert-only: record a CORRECTION entry instead of changing or deleting one.';
END;
$$;

CREATE OR REPLACE FUNCTION "fuel_stock_entry_insert_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.test_data_removal', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'FuelStockEntry is insert-only: record a CORRECTION entry instead of changing or deleting one.';
END;
$$;
