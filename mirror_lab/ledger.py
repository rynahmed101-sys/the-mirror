import hashlib
import json
import sqlite3
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .models import Experiment, Result

class EvidenceLedger:
    """Local SQLite evidence ledger. It records runs; it never judges them."""
    def __init__(self, path: str | Path = "data/mirror.db") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS experiments "
            "(id TEXT PRIMARY KEY, definition_json TEXT NOT NULL, definition_hash TEXT NOT NULL)"
        )
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS runs "
            "(id INTEGER PRIMARY KEY AUTOINCREMENT, experiment_id TEXT NOT NULL, "
            "result_json TEXT NOT NULL, result_hash TEXT NOT NULL)"
        )
        self.db.commit()

    @staticmethod
    def _canonical(value: Any) -> str:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)

    @classmethod
    def _hash(cls, value: Any) -> str:
        return hashlib.sha256(cls._canonical(value).encode()).hexdigest()

    def record(self, experiment: Experiment, result: Result) -> None:
        definition = {
            "id": experiment.id,
            "hypothesis": asdict(experiment.hypothesis),
            "model": {"id": experiment.model.id, "version": experiment.model.version,
                      "description": experiment.model.description},
            "initial_state": experiment.initial_state,
            "parameters": dict(experiment.parameters),
            "steps": experiment.steps, "dt": experiment.dt, "seed": experiment.seed,
            "metadata": dict(experiment.metadata),
        }
        output = {
            "experiment_id": result.experiment_id, "status": result.status,
            "observations": [asdict(item) for item in result.observations],
            "diagnostics": result.diagnostics, "started_at": result.started_at,
            "finished_at": result.finished_at, "error": result.error,
        }
        definition_json = self._canonical(definition)
        output_json = self._canonical(output)
        self.db.execute(
            "INSERT OR REPLACE INTO experiments(id, definition_json, definition_hash) VALUES (?, ?, ?)",
            (experiment.id, definition_json, self._hash(definition))
        )
        self.db.execute(
            "INSERT INTO runs(experiment_id, result_json, result_hash) VALUES (?, ?, ?)",
            (experiment.id, output_json, self._hash(output))
        )
        self.db.commit()

    def close(self) -> None:
        self.db.close()
