-- THE MIRROR — PostgreSQL Immutability Triggers
-- Enforces append-only cryptographic invariants in PostgreSQL

CREATE OR REPLACE FUNCTION prevent_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is immutable: UPDATE and DELETE operations are strictly forbidden.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- Apply immutability trigger to raw_event_ledger
DROP TRIGGER IF EXISTS trg_raw_event_ledger_immutable ON raw_event_ledger;
CREATE TRIGGER trg_raw_event_ledger_immutable
BEFORE UPDATE OR DELETE ON raw_event_ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_immutable_mutation();

-- Apply immutability trigger to raw_messages
DROP TRIGGER IF EXISTS trg_raw_messages_immutable ON raw_messages;
CREATE TRIGGER trg_raw_messages_immutable
BEFORE UPDATE OR DELETE ON raw_messages
FOR EACH ROW
EXECUTE FUNCTION prevent_immutable_mutation();
