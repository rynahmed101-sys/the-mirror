"""Mirror-native program synthesis.

This is deliberately not a hosted language model. It is a constrained synthesis
engine: structured intent + retrieved examples + repository facts are compiled
into a patch plan. The output is executable source only after the normal test and
Automate verification gates.

The engine is extensible through recipes, so new capabilities become knowledge
artifacts rather than another service dependency.
"""
from __future__ import annotations

from dataclasses import dataclass
import ast
import hashlib
import re
from typing import Any, Mapping


@dataclass(frozen=True)
class Recipe:
    name: str
    verbs: tuple[str, ...]
    file_glob: str
    template: str
    test_template: str


@dataclass(frozen=True)
class PatchPlan:
    plan_id: str
    files: tuple[dict[str, str], ...]
    tests: tuple[dict[str, str], ...]
    assumptions: tuple[str, ...]
    unresolved: tuple[str, ...]


RECIPES = (
    Recipe(
        "python_function",
        ("function", "capability", "utility", "helper"),
        "*.py",
        '''def {name}({params}):\n    """{doc}"""\n    {body}\n''',
        '''def test_{name}():\n    result = {name}({test_args})\n    assert result == {expected}\n''',
    ),
    Recipe(
        "python_predicate",
        ("predicate", "validator", "check"),
        "*.py",
        '''def {name}({params}) -> bool:\n    """{doc}"""\n    return {expression}\n''',
        '''def test_{name}():\n    assert {name}({true_args}) is True\n    assert {name}({false_args}) is False\n''',
    ),
)


class ProgramSynthesizer:
    def __init__(self, recipes: tuple[Recipe, ...] = RECIPES) -> None:
        self.recipes = recipes

    def synthesize(self, intent: Mapping[str, Any], *, examples: tuple[str, ...] = ()) -> PatchPlan:
        objective = str(intent.get("objective", "")).strip()
        name = str(intent.get("name", "")).strip()
        if not objective or not name:
            return PatchPlan(self._id(objective, name), (), (), (), ("objective and name are required",))
        if not re.fullmatch(r"[a-z_][a-z0-9_]{1,63}", name):
            return PatchPlan(self._id(objective, name), (), (), (), ("name must be a Python identifier",))
        tokens = set(re.findall(r"[a-z_]+", objective.lower()))
        recipe = max(self.recipes, key=lambda r: len(tokens.intersection(r.verbs)))
        if not tokens.intersection(recipe.verbs):
            return PatchPlan(self._id(objective, name), (), (), (), ("no synthesis recipe matched the intent",))
        params = str(intent.get("params", "")).strip()
        body = str(intent.get("body", "")).strip()
        expression = str(intent.get("expression", "")).strip()
        if recipe.name == "python_function" and not body:
            return PatchPlan(self._id(objective, name), (), (), (), ("function body is not derivable from the supplied intent",))
        if recipe.name == "python_predicate" and not expression:
            return PatchPlan(self._id(objective, name), (), (), (), ("predicate expression is not derivable from the supplied intent",))
        values = {
            "name": name,
            "params": params,
            "doc": str(intent.get("doc", objective)),
            "body": body,
            "expression": expression,
            "test_args": str(intent.get("test_args", "")),
            "expected": repr(intent.get("expected")),
            "true_args": str(intent.get("true_args", "")),
            "false_args": str(intent.get("false_args", "")),
        }
        source = recipe.template.format(**values)
        test = recipe.test_template.format(**values)
        errors = self.validate_python(source) + self.validate_python(test)
        if errors:
            return PatchPlan(self._id(objective, name), (), (), (), tuple(errors))
        target = str(intent.get("target_file", "")).strip()
        if not target.endswith(".py"):
            return PatchPlan(self._id(objective, name), (), (), (), ("target_file must be a Python source file",))
        return PatchPlan(
            self._id(objective, name),
            ({"path": target, "content": source},),
            ({"path": str(intent.get("test_file", "tests/test_generated_capability.py")), "content": test},),
            ("generated from an explicit recipe and structured intent",),
            (),
        )

    @staticmethod
    def validate_python(source: str) -> tuple[str, ...]:
        try:
            ast.parse(source)
        except SyntaxError as exc:
            return (f"generated Python is invalid: {exc}",)
        return ()

    @staticmethod
    def _id(objective: str, name: str) -> str:
        return "synth-" + hashlib.sha256((objective + "|" + name).encode()).hexdigest()[:16]
