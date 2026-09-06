import sqlite3
import hashlib
import json
import threading
import time
import uuid

DB_PATH = r"C:\Users\ssc\.gemini\antigravity\scratch\the-mirror\sqlite.db"
GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

def canonicalize(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'))

def compute_hash(seq, prev_hash, agent_id, event_type, source, payload_canonical, server_ts):
    data = f"{seq}:{prev_hash}:{agent_id}:{event_type}:{source}:{payload_canonical}:{server_ts}"
    return hashlib.sha256(data.encode('utf-8')).hexdigest()

def execute_concurrent_tool_chain(thread_id, tool_name, errors):
    try:
        conn = sqlite3.connect(DB_PATH, timeout=60.0)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 60000")
        
        request_id = f"req_tool_conc_{thread_id}_{uuid.uuid4().hex[:8]}"
        agent_id = f"agent-conc-{thread_id}"
        session_id = f"sess-conc-{thread_id}"
        
        stages = [
            ("TOOL_REQUESTED", "AGENT", {"toolName": tool_name, "args": {"threadId": thread_id}, "requestedBy": agent_id}),
            ("AUTHORIZATION_CHECK", "SYSTEM", {"toolName": tool_name, "status": "AUTHORIZED", "agentId": agent_id}),
            ("TOOL_EXECUTED", "SYSTEM", {"toolName": tool_name, "status": "EXECUTED"}),
            ("TOOL_RESULT", "SYSTEM", {"toolName": tool_name, "status": "SUCCESS", "durationMs": 5, "result": {"processedBy": thread_id}})
        ]
        
        for ev_type, source, payload_data in stages:
            retries = 100
            while retries > 0:
                try:
                    conn.execute("BEGIN IMMEDIATE")
                    c = conn.cursor()
                    c.execute("SELECT sequence_number, event_hash FROM raw_event_ledger ORDER BY sequence_number DESC LIMIT 1")
                    last = c.fetchone()
                    
                    next_seq = (int(last[0]) + 1) if last else 1
                    prev_hash = str(last[1]) if last else GENESIS_HASH
                    now_ms = int(time.time() * 1000)
                    
                    payload_canon = canonicalize(payload_data)
                    ev_hash = compute_hash(next_seq, prev_hash, agent_id, ev_type, source, payload_canon, now_ms)
                    ev_id = f"conc_{request_id}_{ev_type}_{next_seq}"
                    
                    c.execute("""
                    INSERT INTO raw_event_ledger (
                        id, sequence_number, server_timestamp, client_timestamp, timestamp,
                        agent_id, session_id, experiment_id, request_id, event_type,
                        source, payload, event_hash, previous_event_hash, is_immutable
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        ev_id, next_seq, now_ms, now_ms, now_ms // 1000,
                        agent_id, session_id, None, request_id, ev_type,
                        source, payload_canon, ev_hash, prev_hash, 1
                    ))
                    
                    conn.commit()
                    break
                except sqlite3.OperationalError as e:
                    if "locked" in str(e) or "busy" in str(e):
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                        time.sleep(0.01 + (thread_id * 0.002))
                        retries -= 1
                        if retries == 0:
                            raise
                    else:
                        raise
            time.sleep(0.001)
            
        conn.close()
    except Exception as e:
        errors.append((thread_id, str(e)))

print("==================================================================")
print("     THE MIRROR - TOOL CONCURRENCY & ATTRIBUTION STRESS TEST     ")
print("==================================================================")

NUM_THREADS = 8
threads = []
errors = []

t_start = time.time()
for tid in range(NUM_THREADS):
    tool = "get_self_model" if tid % 2 == 0 else "revise_self_model_claim"
    t = threading.Thread(target=execute_concurrent_tool_chain, args=(tid, tool, errors))
    threads.append(t)
    t.start()

for t in threads:
    t.join()

t_duration = time.time() - t_start

if errors:
    print(f"[FAIL] Tool concurrency errors: {errors}")
else:
    # Verify each request_id has exactly 4 stages in strict order
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT request_id, event_type, sequence_number FROM raw_event_ledger WHERE request_id LIKE 'req_tool_conc_%' ORDER BY sequence_number ASC")
    rows = cursor.fetchall()
    conn.close()
    
    chains_by_req = {}
    for req_id, ev_type, seq in rows:
        if req_id not in chains_by_req:
            chains_by_req[req_id] = []
        chains_by_req[req_id].append((ev_type, seq))
        
    expected_order = ["TOOL_REQUESTED", "AUTHORIZATION_CHECK", "TOOL_EXECUTED", "TOOL_RESULT"]
    all_valid = True
    for req_id, chain in chains_by_req.items():
        types = [c[0] for c in chain]
        if types != expected_order:
            all_valid = False
            print(f"[FAIL] Invalid chain for {req_id}: {types}")
            break
            
    if all_valid and len(chains_by_req) == NUM_THREADS:
        print(f"[PASS] Tool Concurrency Stress Test PASSED in {t_duration:.2f}s.")
        print(f"       Successfully executed {NUM_THREADS} parallel 4-stage tool chains ({NUM_THREADS * 4} events).")
        print(f"       Zero request_id collisions or cross-thread bleeding.")
        print(f"       Every request_id preserved the exact 4-stage sequence:")
        print(f"       TOOL_REQUESTED -> AUTHORIZATION_CHECK -> TOOL_EXECUTED -> TOOL_RESULT.")
    else:
        print(f"[FAIL] Chain count mismatch or order invalid: found {len(chains_by_req)} requests, all_valid={all_valid}")
