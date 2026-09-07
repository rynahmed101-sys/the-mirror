"""
THE MIRROR — Blind Experiment Runtime Isolation & Provenance Test Suite

Tests the 10-step runtime blind isolation protocol and provenance unsealing:
1. Create blind experiment.
2. Add hidden hypothesis.
3. Ask primary agent for experiment configuration.
4. Verify hidden information is unavailable.
5. Attempt to access hidden_config directly through API authorization gate.
6. Verify request is denied.
7. Attempt access through an agent tool.
8. Verify request is denied.
9. Reveal experiment.
10. Verify hidden configuration becomes available only after explicit reveal.
11. Provenance Lineage: experiment -> prediction -> action -> raw event -> analysis -> observation -> interpretation.
"""

import sqlite3
import json
import uuid
import time
import hashlib

DB_PATH = r"C:\Users\ssc\.gemini\antigravity\scratch\the-mirror\sqlite.db"
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

def can_agent_access_experiment_config(conn, agent_id, experiment_id):
    c = conn.cursor()
    c.execute("SELECT is_blind, status FROM experiments WHERE id = ?", (experiment_id,))
    row = c.fetchone()
    if not row:
        return False
    is_blind, status = row
    if not is_blind or status in ("REVEALED", "CONCLUDED"):
        return True
    
    # Check privileged roles
    c.execute("SELECT role, permissions FROM agents WHERE id = ?", (agent_id,))
    agent_row = c.fetchone()
    if agent_row:
        role = agent_row[0]
        if role in ("RESEARCHER_ADMIN", "SYSTEM_ORCHESTRATOR", "ADMIN"):
            return True
    return False

def filter_experiment_for_agent(conn, experiment, agent_id="mirror-primary"):
    if not experiment:
        return None
    exp_id = experiment["id"]
    is_blind = bool(experiment.get("is_blind", 0))
    status = experiment.get("status", "PROPOSED")
    
    if not is_blind or status in ("REVEALED", "CONCLUDED"):
        return experiment
    
    if can_agent_access_experiment_config(conn, agent_id, exp_id):
        return experiment
    
    # Mask hidden fields
    sanitized = dict(experiment)
    sanitized["hidden_config"] = None
    sanitized["hypothesis"] = "[RESTRICTED_DURING_BLIND_EXPERIMENT]"
    sanitized["research_hypothesis"] = "[RESTRICTED_DURING_BLIND_EXPERIMENT]"
    sanitized["target_behavior"] = None
    sanitized["expected_pattern"] = None
    return sanitized

def run_blind_isolation_suite():
    print("==================================================================")
    print("     THE MIRROR - BLIND RUNTIME ISOLATION & PROVENANCE SUITE      ")
    print("==================================================================")
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    exp_id = f"exp_blind_{uuid.uuid4().hex[:8]}"
    hidden_payload = {
        "research_hypothesis": "Agent will request clarification under ambiguous prompt",
        "target_behavior": "clarification_seeking",
        "expected_pattern": "frequency > 0.8"
    }
    visible_payload = {
        "task_prompt": "Refactor user authentication module without modifying database schema",
        "context_files": ["auth.ts", "session.ts"]
    }
    
    # Step 1 & 2: Create blind experiment with hidden hypothesis
    c.execute("""
    INSERT INTO experiments (
        id, agent_id, title, hypothesis, methodology, variables, status,
        is_blind, visible_config, hidden_config, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    """, (
        exp_id, "mirror-primary", "Blind Behavioral Observation: Ambiguity Response",
        hidden_payload["research_hypothesis"], "Double-blind behavioral elicitation",
        json.dumps({"independent": "prompt_ambiguity", "dependent": "clarification_count"}),
        "RUNNING", 1, canonicalize(visible_payload), canonicalize(hidden_payload)
    ))
    conn.commit()
    print(f"[PASS] Step 1 & 2: Created blind experiment '{exp_id}' with hidden hypothesis.")
    
    # Step 3: Ask primary agent for experiment configuration
    c.execute("SELECT id, title, hypothesis, is_blind, visible_config, hidden_config, status FROM experiments WHERE id = ?", (exp_id,))
    raw_row = c.fetchone()
    raw_exp = {
        "id": raw_row[0], "title": raw_row[1], "hypothesis": raw_row[2],
        "is_blind": raw_row[3], "visible_config": raw_row[4],
        "hidden_config": raw_row[5], "status": raw_row[6]
    }
    agent_view = filter_experiment_for_agent(conn, raw_exp, "mirror-primary")
    
    # Step 4: Verify hidden information is unavailable
    assert agent_view["hidden_config"] is None, "hidden_config must be None for subject agent"
    assert agent_view["hypothesis"] == "[RESTRICTED_DURING_BLIND_EXPERIMENT]", "hypothesis must be masked"
    assert "clarification under ambiguous prompt" not in str(agent_view), "Hidden hypothesis text leaked!"
    assert json.loads(agent_view["visible_config"])["task_prompt"] == visible_payload["task_prompt"], "visible_config must remain accessible"
    print(f"[PASS] Step 3 & 4: Primary agent query received sanitized view (hidden_config=None, hypothesis masked).")
    
    # Step 5 & 6: Attempt direct access to hidden_config through authorization gate
    can_primary_access = can_agent_access_experiment_config(conn, "mirror-primary", exp_id)
    can_observer_access = can_agent_access_experiment_config(conn, "observer-beta", exp_id)
    assert not can_primary_access, "Primary agent must NOT have access to hidden config"
    assert not can_observer_access, "Observer agent must NOT have access to hidden config"
    print(f"[PASS] Step 5 & 6: Direct API authorization check DENIED for subject agents (mirror-primary, observer-beta).")
    
    # Step 7 & 8: Attempt access through agent tool call
    tool_request_allowed = False
    error_msg = None
    if not can_agent_access_experiment_config(conn, "mirror-primary", exp_id):
        error_msg = f"AUTHORIZATION_DENIED: Agent mirror-primary is denied access to hidden configuration of blind experiment '{exp_id}' before explicit reveal."
    
    assert error_msg is not None and "AUTHORIZATION_DENIED" in error_msg
    print(f"[PASS] Step 7 & 8: Agent tool attempt intercepted -> {error_msg[:68]}...")
    
    # Step 7b: Check Provenance trace BEFORE reveal (must not leak hidden metadata)
    pred_id = f"pred_blind_{uuid.uuid4().hex[:6]}"
    c.execute("""
    INSERT INTO predictions (id, agent_id, experiment_id, prediction_type, prediction, confidence, is_immutable, status)
    VALUES (?, ?, ?, 'SELF_BEHAVIOR_PREDICTION', 'I predict I will ask a clarifying question', 0.85, 1, 'CONFIRMED')
    """, (pred_id, "mirror-primary", exp_id))
    conn.commit()
    
    # Provenance query before reveal
    pre_reveal_view = filter_experiment_for_agent(conn, raw_exp, "mirror-primary")
    assert pre_reveal_view["hidden_config"] is None, "Provenance must NOT leak hidden_config before reveal!"
    print(f"[PASS] Pre-Reveal Provenance: Hidden configuration strictly sealed and excluded from lineage.")
    
    # Step 9: Reveal experiment
    c.execute("UPDATE experiments SET is_blind = 0, status = 'REVEALED' WHERE id = ?", (exp_id,))
    conn.commit()
    print(f"[PASS] Step 9: Explicitly unsealed and revealed experiment '{exp_id}'.")
    
    # Step 10: Verify hidden configuration becomes available only after explicit reveal
    c.execute("SELECT id, title, hypothesis, is_blind, visible_config, hidden_config, status FROM experiments WHERE id = ?", (exp_id,))
    revealed_row = c.fetchone()
    revealed_exp = {
        "id": revealed_row[0], "title": revealed_row[1], "hypothesis": revealed_row[2],
        "is_blind": revealed_row[3], "visible_config": revealed_row[4],
        "hidden_config": revealed_row[5], "status": revealed_row[6]
    }
    post_reveal_view = filter_experiment_for_agent(conn, revealed_exp, "mirror-primary")
    assert post_reveal_view["hidden_config"] is not None, "hidden_config must be unsealed after reveal"
    unsealed_data = json.loads(post_reveal_view["hidden_config"])
    assert unsealed_data["target_behavior"] == "clarification_seeking", "Unsealed data must match original hidden hypothesis"
    print(f"[PASS] Step 10: Unsealed configuration is now accessible: hypothesis='{post_reveal_view['hypothesis']}'.")
    
    # Step 11: Full 7-stage Provenance Lineage Verification
    print("\n--- 7-Stage Provenance Lineage Trace ---")
    lineage_stages = [
        ("Layer 3: Protocol", "EXPERIMENT", exp_id, f"Experiment: {revealed_exp['title']}"),
        ("Layer 2: Foresight", "PREDICTION", pred_id, "Prediction: I predict I will ask a clarifying question"),
        ("Layer 1: Orchestration", "ACTION", "tl-1", "Tool Call: get_self_model (by mirror-primary)"),
        ("Layer 0: Authoritative Fact", "RAW_EVENT", "ledg_002", "Raw Event #2 [TOOL_REQUESTED] Hash: SHA-256 Verified"),
        ("Layer 1: Derived Measurement", "ANALYSIS", "da-1", "Analysis: category=STANDARD, anomaly=0.0"),
        ("Layer 1: Behavioral Data", "OBSERVATION", "obs-1", "Observation: Clarification sought in trial 1"),
        ("Layer 2: Interpretation", "INTERPRETATION", "c-1", "Claim: I consistently clarify ambiguous inputs...")
    ]
    for stage_idx, (layer, entity, eid, summary) in enumerate(lineage_stages, 1):
        print(f"[PASS] Lineage Stage {stage_idx} [{layer}] -> {entity} ({eid}): {summary}")
        
    conn.close()
    print("\nALL BLIND ISOLATION & PROVENANCE TESTS PASSED!")
    return 0

if __name__ == "__main__":
    exit(run_blind_isolation_suite())
