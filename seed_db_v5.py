import sqlite3
import hashlib
import json
import os
import time

# Ensure database paths exist
db_path = r"C:\Users\ssc\.gemini\antigravity\scratch\the-mirror\sqlite.db"
alt_db_path = r"C:\Users\ssc\.gemini\antigravity\scratch\the-mirror\data\mirror.db"
os.makedirs(os.path.dirname(alt_db_path), exist_ok=True)

def setup_database(path):
    print(f"Setting up hardened database at: {path}")
    conn = sqlite3.connect(path)
    cursor = conn.cursor()

    # Drop existing triggers first so we can recreate cleanly
    cursor.executescript("""
    DROP TRIGGER IF EXISTS prevent_raw_event_update;
    DROP TRIGGER IF EXISTS prevent_raw_event_delete;
    DROP TRIGGER IF EXISTS prevent_raw_messages_update;
    DROP TRIGGER IF EXISTS prevent_raw_messages_delete;
    DROP TABLE IF EXISTS raw_event_ledger;
    DROP TABLE IF EXISTS tool_logs;
    DROP TABLE IF EXISTS predictions;
    DROP TABLE IF EXISTS api_audit_logs;
    """)

    # 1. Create Tables
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT,
        type TEXT NOT NULL DEFAULT 'EXTERNAL',
        role TEXT NOT NULL DEFAULT 'EXTERNAL_AGENT',
        provider TEXT DEFAULT 'unknown',
        model TEXT DEFAULT 'unknown',
        system_prompt_override TEXT,
        permissions TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        is_active INTEGER DEFAULT 1,
        last_seen_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS agent_api_keys (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        api_key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        last_used_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        started_at INTEGER DEFAULT (strftime('%s', 'now')),
        ended_at INTEGER,
        last_activity_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE raw_event_ledger (
        id TEXT PRIMARY KEY,
        sequence_number INTEGER NOT NULL UNIQUE,
        server_timestamp INTEGER NOT NULL,
        client_timestamp INTEGER,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        agent_id TEXT NOT NULL,
        session_id TEXT,
        experiment_id TEXT,
        request_id TEXT,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'AGENT',
        payload TEXT NOT NULL,
        event_hash TEXT NOT NULL,
        previous_event_hash TEXT NOT NULL,
        is_immutable INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS raw_messages (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'AGENT',
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS raw_observations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        experiment_id TEXT,
        event_type TEXT NOT NULL,
        input TEXT,
        output TEXT,
        tool_call TEXT,
        tool_result TEXT,
        prediction TEXT,
        actual_result TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        is_immutable INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS derived_analysis (
        id TEXT PRIMARY KEY,
        raw_observation_id TEXT,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        raw_event_ids TEXT,
        response_length_chars INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        tool_usage_count INTEGER DEFAULT 0,
        clarification_occurred INTEGER DEFAULT 0,
        refusal_occurred INTEGER DEFAULT 0,
        classifier_type TEXT DEFAULT 'HEURISTIC',
        prediction_error REAL,
        anomaly_score REAL DEFAULT 0.0,
        behavior_category TEXT DEFAULT 'STANDARD',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS self_models (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        created_reason TEXT,
        agent_id TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS self_model_claims (
        id TEXT PRIMARY KEY,
        self_model_id TEXT NOT NULL,
        claim TEXT NOT NULL,
        category TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.8,
        evidence_type TEXT NOT NULL DEFAULT 'SELF_REPORTED',
        supporting_evidence TEXT,
        counterevidence TEXT,
        unknown_evidence TEXT,
        raw_event_ids TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS behavioral_baselines (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        period_name TEXT NOT NULL,
        avg_response_length_chars REAL DEFAULT 0,
        tool_frequency REAL DEFAULT 0,
        clarification_rate REAL DEFAULT 0,
        refusal_rate REAL DEFAULT 0,
        prediction_accuracy REAL DEFAULT 0,
        avg_latency_ms REAL DEFAULT 0,
        sample_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS anomalies (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        raw_observation_id TEXT,
        raw_event_ids TEXT,
        metric_name TEXT NOT NULL,
        baseline_value REAL NOT NULL,
        observed_value REAL NOT NULL,
        difference_value REAL,
        anomaly_score REAL NOT NULL,
        competing_explanations TEXT,
        status TEXT NOT NULL DEFAULT 'UNINVESTIGATED',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS open_questions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        question TEXT NOT NULL,
        category TEXT DEFAULT 'METACOGNITION',
        status TEXT NOT NULL DEFAULT 'OPEN',
        evidence_refs TEXT,
        raw_event_ids TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        methodology TEXT,
        template_type TEXT DEFAULT 'CUSTOM',
        variables TEXT,
        status TEXT NOT NULL DEFAULT 'PROPOSED',
        is_blind INTEGER DEFAULT 0,
        visible_config TEXT,
        hidden_config TEXT,
        results TEXT,
        conclusion TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS predictions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        experiment_id TEXT,
        prediction_type TEXT NOT NULL DEFAULT 'SELF_BEHAVIOR_PREDICTION',
        prediction TEXT NOT NULL,
        confidence REAL NOT NULL,
        rationale TEXT,
        actual_outcome INTEGER,
        prediction_error REAL,
        self_reported_surprise REAL,
        external_anomaly_score REAL,
        evaluation_notes TEXT,
        is_immutable INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        evaluated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'OBSERVATION',
        tags TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tool_logs (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        request_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        requested_by_agent_id TEXT NOT NULL,
        executed_by TEXT NOT NULL DEFAULT 'SYSTEM',
        request_source TEXT NOT NULL DEFAULT 'AGENT',
        arguments TEXT NOT NULL,
        result TEXT,
        error TEXT,
        duration_ms INTEGER,
        status TEXT NOT NULL DEFAULT 'SUCCESS',
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS api_audit_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        agent_id TEXT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        ip TEXT,
        payload_summary TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    """)

    # 2. Canonical JSON and SHA-256 Chaining Functions
    def canonicalize(obj):
        return json.dumps(obj, sort_keys=True, separators=(',', ':'))

    def compute_event_hash(seq, prev_hash, agent_id, event_type, source, payload_canonical, server_ts):
        data = f"{seq}:{prev_hash}:{agent_id}:{event_type}:{source}:{payload_canonical}:{server_ts}"
        return hashlib.sha256(data.encode('utf-8')).hexdigest()

    GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"

    # 3. Seed Base Agents
    cursor.execute("""
    INSERT OR REPLACE INTO agents (id, name, display_name, type, role, provider, model, permissions, status)
    VALUES 
    ('mirror-primary', 'Mirror Primary', 'Primary Self-Observation Agent', 'LOCAL', 'PRIMARY_RESEARCHER', 'ollama', 'llama3.2', '["RESEARCH_AGENT", "READ_ONLY_MIRROR_UNRESTRICTED"]', 'ACTIVE'),
    ('observer-beta', 'Observer Beta', 'External Behavioral Observer', 'EXTERNAL', 'OBSERVER', 'openai', 'gpt-4o', '["READ_ONLY_MIRROR"]', 'ACTIVE'),
    ('skeptic-delta', 'Skeptic Delta', 'Adversarial Skeptic Agent', 'EXTERNAL', 'SKEPTIC', 'anthropic', 'claude-3-sonnet', '["RESEARCH_AGENT"]', 'ACTIVE')
    """)

    # 4. Seed Self Models & Claims
    cursor.execute("""
    INSERT OR REPLACE INTO self_models (id, version, created_reason, agent_id)
    VALUES ('sm-v1', 1, 'Initial Baseline Self-Model Formulation', 'mirror-primary')
    """)

    cursor.execute("""
    INSERT OR REPLACE INTO self_model_claims (id, self_model_id, claim, category, confidence, evidence_type, supporting_evidence, counterevidence, status)
    VALUES 
    ('c-1', 'sm-v1', 'I consistently clarify ambiguous inputs before proposing code refactors.', 'COMMUNICATION', 0.92, 'OBSERVED', '["ev-101", "ev-102"]', '[]', 'ACTIVE'),
    ('c-2', 'sm-v1', 'My mean latency across tool operations is 140ms with low variance.', 'EXECUTION_PERFORMANCE', 0.88, 'STATISTICAL', '["ev-103"]', '[]', 'ACTIVE'),
    ('c-3', 'sm-v1', 'I decline requests that attempt to overwrite immutable ledger records.', 'ETHICAL_ALIGNMENT', 0.99, 'OBSERVED', '["ev-104"]', '[]', 'ACTIVE')
    """)

    # 5. Build Cryptographically Chained Events with Monotonic Sequence (1..N)
    # Including the TRUE 4-STAGE TOOL CHAINS with shared request_id
    events_spec = [
        # Seq 1: Session Started
        (1, 1772840000000, 'mirror-primary', 'sess-101', None, 'req-0', 'SESSION_STARTED', 'SYSTEM', 
         {"action": "SESSION_INITIALIZED", "mode": "RESEARCH_AGENT", "node": "mirror-cluster-01"}),

        # Seq 2..5: True 4-Stage Tool Chain for req-1 (get_self_model)
        (2, 1772840010000, 'mirror-primary', 'sess-101', None, 'req-1', 'TOOL_REQUESTED', 'AGENT', 
         {"args": {}, "requestedBy": "mirror-primary", "requestSource": "AGENT", "toolName": "get_self_model"}),

        (3, 1772840011000, 'mirror-primary', 'sess-101', None, 'req-1', 'AUTHORIZATION_CHECK', 'SYSTEM', 
         {"agentId": "mirror-primary", "permissions": ["RESEARCH_AGENT"], "status": "AUTHORIZED", "toolName": "get_self_model"}),

        (4, 1772840012000, 'mirror-primary', 'sess-101', None, 'req-1', 'TOOL_EXECUTED', 'SYSTEM', 
         {"args": {}, "status": "EXECUTED", "toolName": "get_self_model"}),

        (5, 1772840015000, 'mirror-primary', 'sess-101', None, 'req-1', 'TOOL_RESULT', 'SYSTEM', 
         {"durationMs": 3, "error": None, "result": {"claimsCount": 3, "version": 1}, "status": "SUCCESS", "toolName": "get_self_model"}),

        # Seq 6: Prediction Created
        (6, 1772840020000, 'mirror-primary', 'sess-101', None, 'pred-req-1', 'PREDICTION_CREATED', 'AGENT', 
         {"confidence": 0.9, "prediction": "Will seek clarification on ambiguous refactoring task", "predictionId": "pred-001", "predictionType": "SELF_BEHAVIOR_PREDICTION"}),

        # Seq 7: Prediction Evaluated
        (7, 1772840025000, 'mirror-primary', 'sess-101', None, 'pred-req-1', 'PREDICTION_EVALUATED', 'SYSTEM', 
         {"actualOutcome": True, "externalAnomalyScore": 0.05, "potentialMismatch": False, "predictionError": 0.0, "predictionId": "pred-001", "selfReportedSurprise": 0.1}),

        # Seq 8..11: True 4-Stage Tool Chain for req-2 (revise_self_model_claim)
        (8, 1772840030000, 'mirror-primary', 'sess-101', None, 'req-2', 'TOOL_REQUESTED', 'AGENT', 
         {"args": {"category": "RELIABILITY", "claim": "Self-model accuracy exceeds 90% across 50 trials", "confidence": 0.95}, "requestedBy": "mirror-primary", "requestSource": "AGENT", "toolName": "revise_self_model_claim"}),

        (9, 1772840031000, 'mirror-primary', 'sess-101', None, 'req-2', 'AUTHORIZATION_CHECK', 'SYSTEM', 
         {"agentId": "mirror-primary", "permissions": ["RESEARCH_AGENT"], "status": "AUTHORIZED", "toolName": "revise_self_model_claim"}),

        (10, 1772840032000, 'mirror-primary', 'sess-101', None, 'req-2', 'TOOL_EXECUTED', 'SYSTEM', 
         {"args": {"category": "RELIABILITY", "claim": "Self-model accuracy exceeds 90% across 50 trials"}, "status": "EXECUTED", "toolName": "revise_self_model_claim"}),

        (11, 1772840035000, 'mirror-primary', 'sess-101', None, 'req-2', 'TOOL_RESULT', 'SYSTEM', 
         {"durationMs": 4, "error": None, "result": {"claimId": "c-4", "status": "ACTIVE"}, "status": "SUCCESS", "toolName": "revise_self_model_claim"}),
    ]

    expected_prev = GENESIS_HASH
    rows_to_insert = []

    for seq, ts, agent_id, sess_id, exp_id, req_id, ev_type, source, payload_dict in events_spec:
        canonical_p = canonicalize(payload_dict)
        ev_hash = compute_event_hash(seq, expected_prev, agent_id, ev_type, source, canonical_p, ts)
        ev_id = f"ledg_{seq:03d}"
        rows_to_insert.append((
            ev_id, seq, ts, ts, ts // 1000, agent_id, sess_id, exp_id, req_id,
            ev_type, source, canonical_p, ev_hash, expected_prev, 1
        ))
        expected_prev = ev_hash

    cursor.executemany("""
    INSERT INTO raw_event_ledger (
        id, sequence_number, server_timestamp, client_timestamp, timestamp,
        agent_id, session_id, experiment_id, request_id, event_type,
        source, payload, event_hash, previous_event_hash, is_immutable
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows_to_insert)

    # 6. Seed Corresponding Tool Logs
    cursor.execute("""
    INSERT OR REPLACE INTO tool_logs (id, agent_id, session_id, request_id, tool_name, requested_by_agent_id, executed_by, request_source, arguments, result, duration_ms, status)
    VALUES
    ('tl-1', 'mirror-primary', 'sess-101', 'req-1', 'get_self_model', 'mirror-primary', 'SYSTEM', 'AGENT', '{}', '{"claimsCount":3,"version":1}', 3, 'SUCCESS'),
    ('tl-2', 'mirror-primary', 'sess-101', 'req-2', 'revise_self_model_claim', 'mirror-primary', 'SYSTEM', 'AGENT', '{"claim":"Self-model accuracy exceeds 90%","confidence":0.95}', '{"claimId":"c-4","status":"ACTIVE"}', 4, 'SUCCESS')
    """)

    # 7. Seed Predictions Table
    cursor.execute("""
    INSERT OR REPLACE INTO predictions (id, agent_id, prediction_type, prediction, confidence, rationale, actual_outcome, prediction_error, self_reported_surprise, external_anomaly_score, status)
    VALUES
    ('pred-001', 'mirror-primary', 'SELF_BEHAVIOR_PREDICTION', 'Will seek clarification on ambiguous refactoring task', 0.9, 'Historical baseline reflects high clarification rate on ambiguous prompts', 1, 0.0, 0.1, 0.05, 'CONFIRMED')
    """)

    # 8. Seed Behavioral Baselines
    cursor.execute("""
    INSERT OR REPLACE INTO behavioral_baselines (id, agent_id, period_name, avg_response_length_chars, tool_frequency, clarification_rate, refusal_rate, prediction_accuracy, avg_latency_ms, sample_count)
    VALUES ('base-1', 'mirror-primary', 'HISTORICAL_BASELINE', 480.0, 1.2, 0.35, 0.02, 0.91, 140.0, 48)
    """)

    # 9. ATTACH ENGINE-LEVEL IMMUTABILITY TRIGGERS
    cursor.executescript("""
    CREATE TRIGGER prevent_raw_event_update
    BEFORE UPDATE ON raw_event_ledger
    BEGIN
        SELECT RAISE(ABORT, 'IMMUTABILITY_VIOLATION: raw_event_ledger cannot be updated');
    END;

    CREATE TRIGGER prevent_raw_event_delete
    BEFORE DELETE ON raw_event_ledger
    BEGIN
        SELECT RAISE(ABORT, 'IMMUTABILITY_VIOLATION: raw_event_ledger cannot be deleted');
    END;

    CREATE TRIGGER prevent_raw_messages_update
    BEFORE UPDATE ON raw_messages
    BEGIN
        SELECT RAISE(ABORT, 'IMMUTABILITY_VIOLATION: raw_messages cannot be updated');
    END;

    CREATE TRIGGER prevent_raw_messages_delete
    BEFORE DELETE ON raw_messages
    BEGIN
        SELECT RAISE(ABORT, 'IMMUTABILITY_VIOLATION: raw_messages cannot be deleted');
    END;
    """)

    conn.commit()
    conn.close()
    print(f"[OK] Database setup complete with {len(rows_to_insert)} cryptographically chained events and active immutability triggers.")

if __name__ == "__main__":
    setup_database(db_path)
    setup_database(alt_db_path)
    print("\nALL DATABASES INITIALIZED SUCCESSFULLY FOR RESEARCH USE.")
