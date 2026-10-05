import argparse
import json

from .examples import run_demo

def main():
    parser = argparse.ArgumentParser(
        prog="mirror",
        description="THE MIRROR exploratory mathematics and physics laboratory",
    )
    parser.add_argument("command", choices=["demo"])
    args = parser.parse_args()
    if args.command == "demo":
        result = run_demo()
        print(json.dumps({
            "experiment": result.experiment_id,
            "status": result.status,
            "steps": len(result.observations) - 1,
            "final_state": result.final_state,
            "diagnostics": result.diagnostics,
        }, indent=2, default=str))
