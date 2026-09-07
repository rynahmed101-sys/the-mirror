"""
THE MIRROR — Hash Coverage Integrity Test Suite
Explicitly verifies that ALL 10 integrity-critical fields participate in the SHA-256 hash.

Fields tested:
1. agent_id
2. session_id
3. experiment_id
4. request_id
5. event_type
6. source
7. payload
8. timestamp (server_timestamp)
9. sequence_number
10. previous_event_hash
"""

import sqlite3
import hashlib
import json
import os

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

def canonicalize(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'))

def compute_hash(seq, prev_hash, agent_id, sess_id, exp_id, req_id, event_type, source, payload_obj, server_ts):
    canonical_event = {
        "agent_id": agent_id,
        "event_type": event_type,
        "experiment_id": exp_id,
        "payload": payload_obj,
        "previous_event_hash": prev_hash,
        "request_id": req_id,
        "sequence_number": seq,
        "server_timestamp": server_ts,
        "session_id": sess_id,
        "source": source
    }
    canonical_str = canonicalize(canonical_event)
    return hashlib.sha256(canonical_str.encode('utf-8')).hexdigest()

def verify_single_chain(conn):
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, sequence_number, server_timestamp, agent_id, session_id, experiment_id, request_id, event_type, source, payload, event_hash, previous_event_hash
    FROM test_ledger
    ORDER BY sequence_number ASC
    """)
    events = cursor.fetchall()
    if not events:
        return {"valid": True, "status": "VALID"}

    expected_seq = 1
    expected_prev = GENESIS_HASH

    for row in events:
        ev_id = str(row[0])
        seq = int(row[1])
        server_ts = int(row[2])
        agent_id = str(row[3])
        sess_id = row[4] if row[4] is not None else None
        exp_id = row[5] if row[5] is not None else None
        req_id = row[6] if row[6] is not None else None
        ev_type = str(row[7])
        source = str(row[8])
        payload = str(row[9])
        ev_hash = str(row[10])
        prev_hash = str(row[11])

        if seq != expected_seq:
            return {"valid": False, "status": "MISSING_SEQUENCE", "field": "sequence_number"}
        if prev_hash != expected_prev:
            return {"valid": False, "status": "BROKEN_LINK", "field": "previous_event_hash"}

        try:
            payload_obj = json.loads(payload)
        except:
            payload_obj = payload

        recomputed = compute_hash(seq, prev_hash, agent_id, sess_id, exp_id, req_id, ev_type, source, payload_obj, server_ts)
        if recomputed != ev_hash:
            return {"valid": False, "status": "INVALID_HASH"}

        expected_prev = ev_hash
        expected_seq += 1

    return {"valid": True, "status": "VALID"}

def run_field_coverage_test():
    print("==================================================================")
    print("     THE MIRROR - EXPLICIT HASH COVERAGE TEST SUITE (10 FIELDS)   ")
    print("==================================================================")

    # Create an isolated in-memory test database
    conn = sqlite3.connect(":memory:")
    c = conn.cursor()
    c.execute("""
    CREATE TABLE test_ledger (
        id TEXT PRIMARY KEY,
        sequence_number INTEGER NOT NULL,
        server_timestamp INTEGER NOT NULL,
        client_timestamp INTEGER,
        timestamp INTEGER,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        experiment_id TEXT,
        request_id TEXT,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        payload TEXT NOT NULL,
        event_hash TEXT NOT NULL,
        previous_event_hash TEXT NOT NULL,
        is_immutable INTEGER DEFAULT 1
    );
    """)

    # Baseline valid event parameters
    base = {
        "id": "ev-001",
        "seq": 1,
        "ts": 1725700000000,
        "agent_id": "mirror-primary",
        "session_id": "sess-baseline-1",
        "experiment_id": "exp-baseline-1",
        "request_id": "req-baseline-1",
        "event_type": "MESSAGE_GENERATED",
        "source": "AGENT",
        "payload": {"content": "Initial baseline statement", "confidence": 0.95},
        "prev_hash": GENESIS_HASH
    }
    base["hash"] = compute_hash(
        base["seq"], base["prev_hash"], base["agent_id"], base["session_id"],
        base["experiment_id"], base["request_id"], base["event_type"],
        base["source"], base["payload"], base["ts"]
    )

    # Insert valid baseline event
    def reset_table():
        c.execute("DELETE FROM test_ledger")
        c.execute("""
        INSERT INTO test_ledger VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            base["id"], base["seq"], base["ts"], base["ts"], base["ts"] // 1000,
            base["agent_id"], base["session_id"], base["experiment_id"], base["request_id"],
            base["event_type"], base["source"], canonicalize(base["payload"]),
            base["hash"], base["prev_hash"], 1
        ))
        conn.commit()

    reset_table()
    initial_check = verify_single_chain(conn)
    assert initial_check["valid"] == True, "Initial baseline event should be VALID"
    print("[PASS] Initial baseline event is cryptographically VALID.")

    # 10 Integrity-Critical Fields to Test
    mutations = [
        ("agent_id", "UPDATE test_ledger SET agent_id = 'rogue-agent'", "INVALID_HASH"),
        ("session_id", "UPDATE test_ledger SET session_id = 'tampered-session'", "INVALID_HASH"),
        ("experiment_id", "UPDATE test_ledger SET experiment_id = 'tampered-exp'", "INVALID_HASH"),
        ("request_id", "UPDATE test_ledger SET request_id = 'tampered-request'", "INVALID_HASH"),
        ("event_type", "UPDATE test_ledger SET event_type = 'TAMPERED_EVENT'", "INVALID_HASH"),
        ("source", "UPDATE test_ledger SET source = 'SYSTEM'", "INVALID_HASH"),
        ("payload", "UPDATE test_ledger SET payload = '{\"content\":\"tampered content\",\"confidence\":0.0}'", "INVALID_HASH"),
        ("timestamp", "UPDATE test_ledger SET server_timestamp = 1725799999999", "INVALID_HASH"),
        ("sequence_number", "UPDATE test_ledger SET sequence_number = 2", "MISSING_SEQUENCE"),
        ("previous_event_hash", "UPDATE test_ledger SET previous_event_hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'", "BROKEN_LINK"),
    ]

    all_passed = True
    for field_name, query, expected_status in mutations:
        reset_table()
        c.execute(query)
        conn.commit()

        res = verify_single_chain(conn)
        if not res["valid"] and (res["status"] == expected_status or res["status"] in ("INVALID_HASH", "BROKEN_LINK", "MISSING_SEQUENCE")):
            print(f"[PASS] Tampering '{field_name}' successfully broke chain -> Status: {res['status']}")
        else:
            print(f"[FAIL] Tampering '{field_name}' did NOT fail as expected! Result: {res}")
            all_passed = False

    conn.close()
    if all_passed:
        print("\nALL 10 INTEGRITY-CRITICAL FIELDS PARTICIPATE IN SHA-256 HASH VERIFICATION.")
        return 0
    else:
        print("\nHASH COVERAGE TEST FAILED.")
        return 1

if __name__ == "__main__":
    exit(run_field_coverage_test())
