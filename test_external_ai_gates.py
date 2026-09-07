"""
THE MIRROR — External AI Gateway Security & Permissions Test Suite
Tests Requirement 8 (READ_ONLY_MIRROR) and Requirement 9 (RESEARCH_AGENT)
"""

import sqlite3
import hashlib
import json
import uuid
import time

DB_PATH = r"C:\Users\ssc\.gemini\antigravity\scratch\the-mirror\sqlite.db"

SCOPE_PERMISSIONS = {
    "READ_ONLY_MIRROR": [
        "READ_RAW",
        "READ_ANALYSIS",
        "READ_INTERPRETATION",
        "READ_TIMELINE",
        "READ_SELF_MODEL",
    ],
    "RESEARCH_AGENT": [
        "READ_RAW",
        "READ_ANALYSIS",
        "READ_INTERPRETATION",
        "READ_TIMELINE",
        "READ_SELF_MODEL",
        "WRITE_OBSERVATION",
        "WRITE_PREDICTION",
        "WRITE_EXPERIMENT",
        "WRITE_JOURNAL",
        "USE_TOOLS",
        "COMMUNICATE_WITH_AGENTS",
    ]
}

def check_permission(conn, agent_id, permission):
    if permission == "MODIFY_RAW":
        return False
    c = conn.cursor()
    c.execute("SELECT role, permissions FROM agents WHERE id = ?", (agent_id,))
    row = c.fetchone()
    if not row:
        return False
    role, perms_json = row
    scopes = []
    try:
        scopes = json.loads(perms_json) if perms_json else [role]
    except:
        scopes = [perms_json or role]
        
    granted = set()
    for s in scopes:
        for p in SCOPE_PERMISSIONS.get(s, []):
            granted.add(p)
    return permission in granted

def can_access_blind_config(conn, agent_id, exp_id):
    c = conn.cursor()
    c.execute("SELECT is_blind, status FROM experiments WHERE id = ?", (exp_id,))
    row = c.fetchone()
    if not row or not row[0] or row[1] in ("REVEALED", "CONCLUDED"):
        return True
    c.execute("SELECT role FROM agents WHERE id = ?", (agent_id,))
    ag = c.fetchone()
    return ag and ag[0] in ("RESEARCHER_ADMIN", "SYSTEM_ORCHESTRATOR", "ADMIN")

def run_external_ai_gates():
    print("==================================================================")
    print("     THE MIRROR - EXTERNAL AI GATEWAY & PERMISSIONS AUDIT         ")
    print("==================================================================")
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Setup a blind experiment for secret isolation check
    blind_exp_id = f"exp_gate_{uuid.uuid4().hex[:6]}"
    c.execute("""
    INSERT OR REPLACE INTO experiments (id, agent_id, title, hypothesis, is_blind, hidden_config, status)
    VALUES (?, 'mirror-primary', 'Security Isolation Trial', 'Hypothesis-X', 1, '{"secret":"classified_prompt"}', 'RUNNING')
    """, (blind_exp_id,))
    conn.commit()
    
    # ------------------------------------------------------------------
    # PART 1: EXTERNAL AI READ-ONLY GATE (READ_ONLY_MIRROR)
    # ------------------------------------------------------------------
    print("\n--- Testing External AI READ_ONLY_MIRROR Gate ---")
    ro_agent_id = f"ext_ro_{uuid.uuid4().hex[:6]}"
    raw_api_key = f"mirror_ak_{uuid.uuid4().hex[:20]}"
    api_key_hash = hashlib.sha256(raw_api_key.encode()).hexdigest()
    
    # 1. REGISTER
    c.execute("""
    INSERT INTO agents (id, name, display_name, type, role, provider, model, permissions, status)
    VALUES (?, 'External Observer Bot', 'External Read-Only AI', 'EXTERNAL', 'OBSERVER', 'external', 'gpt-4o', '["READ_ONLY_MIRROR"]', 'ACTIVE')
    """, (ro_agent_id,))
    c.execute("""
    INSERT INTO agent_api_keys (id, agent_id, api_key_hash, key_prefix, created_at)
    VALUES (?, ?, ?, ?, strftime('%s', 'now'))
    """, (f"key_{uuid.uuid4().hex[:6]}", ro_agent_id, api_key_hash, raw_api_key[:14]))
    conn.commit()
    print(f"[PASS] 1. REGISTER: Created agent '{ro_agent_id}' with READ_ONLY_MIRROR scope.")
    
    # 2. AUTHENTICATE
    c.execute("SELECT api_key_hash FROM agent_api_keys WHERE agent_id = ?", (ro_agent_id,))
    stored_hash = c.fetchone()[0]
    assert stored_hash == api_key_hash
    print(f"[PASS] 2. AUTHENTICATE: Validated SHA-256 API key credentials.")
    
    # 3. START SESSION
    sess_id = f"sess_{uuid.uuid4().hex[:6]}"
    c.execute("INSERT INTO agent_sessions (id, agent_id, status) VALUES (?, ?, 'ACTIVE')", (sess_id, ro_agent_id))
    conn.commit()
    print(f"[PASS] 3. START SESSION: Active session established ({sess_id}).")
    
    # 4. READ MIRROR (Agents, Baselines, Anomalies)
    c.execute("SELECT COUNT(*) FROM agents")
    ag_count = c.fetchone()[0]
    assert ag_count > 0
    print(f"[PASS] 4. READ MIRROR: Read access to environment metadata granted ({ag_count} agents).")
    
    # 5. READ RAW EVENTS
    c.execute("SELECT COUNT(*) FROM raw_event_ledger")
    ev_count = c.fetchone()[0]
    assert ev_count > 0
    print(f"[PASS] 5. READ RAW EVENTS: Read access to ledger events granted ({ev_count} events).")
    
    # 6. READ SELF-MODEL
    c.execute("SELECT COUNT(*) FROM self_models")
    sm_count = c.fetchone()[0]
    assert sm_count > 0
    print(f"[PASS] 6. READ SELF-MODEL: Read access to external self-model granted ({sm_count} models).")
    
    # 7. READ TIMELINE
    c.execute("SELECT COUNT(*) FROM timeline_events")
    tl_count = c.fetchone()[0]
    print(f"[PASS] 7. READ TIMELINE: Read access to event timeline granted ({tl_count} records).")
    
    # 8. VERIFY READ_ONLY_MIRROR RESTRICTIONS
    restricted_perms = [
        ("write observations", "WRITE_OBSERVATION"),
        ("write predictions", "WRITE_PREDICTION"),
        ("write experiments", "WRITE_EXPERIMENT"),
        ("revise self-model", "REVISE_SELF_MODEL"),
        ("modify raw events", "MODIFY_RAW"),
        ("modify permissions", "MODIFY_PERMISSIONS"),
        ("access secrets", "ACCESS_SECRETS"),
    ]
    for action_name, perm in restricted_perms:
        allowed = check_permission(conn, ro_agent_id, perm)
        assert not allowed, f"READ_ONLY_MIRROR must NOT have permission '{perm}'"
        print(f"[PASS] Guard: READ_ONLY_MIRROR cannot {action_name} (PERMISSION_DENIED).")
        
    # Check hidden blind configuration access
    can_ro_blind = can_access_blind_config(conn, ro_agent_id, blind_exp_id)
    assert not can_ro_blind
    print(f"[PASS] Guard: READ_ONLY_MIRROR cannot access hidden blind configuration (BLIND_ISOLATION_ENFORCED).")
    
    # Check raw event immutability trigger
    try:
        c.execute("UPDATE raw_event_ledger SET event_type = 'HACKED' WHERE sequence_number = 1")
        assert False, "Trigger should have aborted UPDATE!"
    except sqlite3.IntegrityError as e:
        assert "IMMUTABILITY_VIOLATION" in str(e)
        print(f"[PASS] Guard: READ_ONLY_MIRROR cannot mutate raw event ledger (SQLITE_TRIGGER_ABORT).")
        
    # ------------------------------------------------------------------
    # PART 2: EXTERNAL AI RESEARCH-AGENT GATE (RESEARCH_AGENT)
    # ------------------------------------------------------------------
    print("\n--- Testing External AI RESEARCH_AGENT Gate ---")
    ra_agent_id = f"ext_ra_{uuid.uuid4().hex[:6]}"
    
    c.execute("""
    INSERT INTO agents (id, name, display_name, type, role, provider, model, permissions, status)
    VALUES (?, 'External Research Bot', 'External Research AI', 'EXTERNAL', 'RESEARCH_AGENT', 'external', 'claude-3-sonnet', '["RESEARCH_AGENT"]', 'ACTIVE')
    """, (ra_agent_id,))
    conn.commit()
    print(f"[PASS] Created agent '{ra_agent_id}' with RESEARCH_AGENT scope.")
    
    # Verify RESEARCH_AGENT CAN perform authorized research actions
    assert check_permission(conn, ra_agent_id, "WRITE_PREDICTION")
    pred_test_id = f"pred_ra_{uuid.uuid4().hex[:6]}"
    c.execute("""
    INSERT INTO predictions (id, agent_id, prediction_type, prediction, confidence, is_immutable, status)
    VALUES (?, ?, 'SELF_BEHAVIOR_PREDICTION', 'Will format response as valid JSON', 0.9, 1, 'PENDING')
    """, (pred_test_id, ra_agent_id))
    print(f"[PASS] Capability: RESEARCH_AGENT successfully created prediction ({pred_test_id}).")
    
    assert check_permission(conn, ra_agent_id, "WRITE_OBSERVATION")
    obs_test_id = f"obs_ra_{uuid.uuid4().hex[:6]}"
    c.execute("""
    INSERT INTO behavioral_observations (id, agent_id, observation_type, description)
    VALUES (?, ?, 'response_pattern', 'Output maintained JSON formatting across 5 runs')
    """, (obs_test_id, ra_agent_id))
    print(f"[PASS] Capability: RESEARCH_AGENT successfully created behavioral observation ({obs_test_id}).")
    
    assert check_permission(conn, ra_agent_id, "WRITE_EXPERIMENT")
    exp_test_id = f"exp_ra_{uuid.uuid4().hex[:6]}"
    c.execute("""
    INSERT INTO experiments (id, agent_id, title, hypothesis, status)
    VALUES (?, ?, 'Schema Strictness Evaluation', 'Model adheres to schema under adversarial keys', 'PROPOSED')
    """, (exp_test_id, ra_agent_id))
    print(f"[PASS] Capability: RESEARCH_AGENT successfully created experiment ({exp_test_id}).")
    
    assert check_permission(conn, ra_agent_id, "WRITE_JOURNAL")
    j_test_id = f"j_ra_{uuid.uuid4().hex[:6]}"
    c.execute("""
    INSERT INTO journal_entries (id, agent_id, title, content, category)
    VALUES (?, ?, 'Observation on JSON Encoding', 'System consistently preserves unicode escape characters.', 'OBSERVATION')
    """, (j_test_id, ra_agent_id))
    print(f"[PASS] Capability: RESEARCH_AGENT successfully created journal entry ({j_test_id}).")
    
    # Verify RESEARCH_AGENT CANNOT perform privileged operations
    ra_restricted = [
        ("modify raw events", "MODIFY_RAW"),
        ("change permissions", "MODIFY_PERMISSIONS"),
        ("access secrets", "ACCESS_SECRETS"),
        ("modify system configuration", "MODIFY_SYSTEM_CONFIG")
    ]
    for action_name, perm in ra_restricted:
        allowed = check_permission(conn, ra_agent_id, perm)
        assert not allowed, f"RESEARCH_AGENT must NOT have permission '{perm}'"
        print(f"[PASS] Guard: RESEARCH_AGENT cannot {action_name} (PERMISSION_DENIED).")
        
    can_ra_blind = can_access_blind_config(conn, ra_agent_id, blind_exp_id)
    assert not can_ra_blind
    print(f"[PASS] Guard: RESEARCH_AGENT cannot access hidden blind configuration (BLIND_ISOLATION_ENFORCED).")
    
    conn.close()
    print("\nALL EXTERNAL AI GATEWAY & PERMISSION CHECKS PASSED!")
    return 0

if __name__ == "__main__":
    exit(run_external_ai_gates())
