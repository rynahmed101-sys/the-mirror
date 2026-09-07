"""
THE MIRROR — MASTER RESEARCH-INTEGRITY TEST SUITE RUNNER
Executes all test suites in deterministic order and outputs clean summary.
"""

import subprocess
import sys
import time

PYTHON_EXE = r"C:\Users\ssc\Python313\python.exe"
SCRATCH_DIR = r"C:\Users\ssc\.gemini\antigravity\scratch"

TESTS = [
    ("Database Migration & Seeding", f"{SCRATCH_DIR}\\seed_db_v5.py"),
    ("Core Research Integrity Suite (11 Tests)", f"{SCRATCH_DIR}\\test_research_integrity.py"),
    ("10-Field SHA-256 Hash Coverage Test", f"{SCRATCH_DIR}\\test_hash_coverage.py"),
    ("Blind Runtime Isolation & Provenance (10 Steps)", f"{SCRATCH_DIR}\\test_blind_isolation.py"),
    ("Tool Concurrency & Attribution Stress Test", f"{SCRATCH_DIR}\\test_tool_concurrency.py"),
    ("External AI Gateways (Read-Only & Research-Agent)", f"{SCRATCH_DIR}\\test_external_ai_gates.py"),
    ("Aggressive Live Concurrency Stress Audit (50 Writers / 3 Runs)", f"{SCRATCH_DIR}\\test_aggressive_concurrency.py"),
    ("Final Research Acceptance Suite", f"{SCRATCH_DIR}\\test_final_acceptance.py"),
]

def main():
    print("=" * 70)
    print("      THE MIRROR — COMPREHENSIVE RESEARCH INTEGRITY AUDIT")
    print("      Classification: RESEARCH PROTOTYPE")
    print("=" * 70)
    
    total_suites = len(TESTS)
    passed_suites = 0
    failed_suites = 0
    warnings = 0
    
    t_global_start = time.time()
    
    for idx, (name, script_path) in enumerate(TESTS, 1):
        print(f"\n[{idx}/{total_suites}] Executing: {name}")
        print("-" * 70)
        t_start = time.time()
        
        proc = subprocess.run(
            [PYTHON_EXE, script_path],
            cwd=SCRATCH_DIR,
            capture_output=True,
            text=True
        )
        elapsed = time.time() - t_start
        
        # Clean output filtering
        stdout_lines = proc.stdout.strip().splitlines()
        for line in stdout_lines:
            print(f"  {line}")
            
        if proc.returncode == 0:
            passed_suites += 1
            print(f"--> [SUITE PASS] {name} completed in {elapsed:.2f}s")
        else:
            failed_suites += 1
            print(f"--> [SUITE FAIL] {name} failed with code {proc.returncode} in {elapsed:.2f}s")
            if proc.stderr:
                print(f"    ERROR: {proc.stderr.strip()}")
                
    total_elapsed = time.time() - t_global_start
    
    print("\n" + "=" * 70)
    print("                   FINAL AUDIT REPORT")
    print("=" * 70)
    print(f"TOTAL TEST SUITES EXECUTED: {total_suites}")
    print(f"PASSED:                     {passed_suites}")
    print(f"FAILED:                     {failed_suites}")
    print(f"WARNINGS:                   {warnings}")
    print(f"TOTAL TIME:                 {total_elapsed:.2f}s")
    print("=" * 70)
    
    if failed_suites == 0:
        print("ALL RESEARCH INTEGRITY SUITES PASSED.")
        print("THE MIRROR IS CERTIFIED AS A VALID RESEARCH PROTOTYPE.")
        print("READY FOR CONTROLLED EXTERNAL AI BEHAVIORAL OBSERVATION.")
        return 0
    else:
        print("AUDIT FAILED.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
