import argparse
import json

from .examples import demo_model, run_demo
from .manifest import ExperimentManifest
from .mission import run_mission
from .operator import LabOperator
from .registry import ModelRegistry


def _print_result(result) -> None:
    print(json.dumps({
        "experiment": result.experiment_id,
        "status": result.status,
        "steps": len(result.observations) - 1,
        "final_state": result.final_state,
        "diagnostics": result.diagnostics,
    }, indent=2, default=str))


def main():
    parser = argparse.ArgumentParser(
        prog="mirror",
        description="THE MIRROR exploratory mathematics and physics laboratory",
    )
    parser.add_argument("command", choices=["demo", "run-manifest", "run-mission"])
    parser.add_argument("manifest", nargs="?")
    args = parser.parse_args()

    if args.command == "demo":
        _print_result(run_demo())
        return

    if not args.manifest:
        parser.error(f"{args.command} requires a JSON input path")

    if args.command == "run-mission":
        print(json.dumps(run_mission(args.manifest), indent=2, sort_keys=True, default=str))
        return

    registry = ModelRegistry()
    registry.register(demo_model())
    operator = LabOperator(registry=registry)
    try:
        _print_result(operator.load_and_run(args.manifest, record=False))
    finally:
        operator.close()
