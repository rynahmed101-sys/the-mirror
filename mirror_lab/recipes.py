"""Composable, repository-native synthesis recipes.

Recipes are small transformations, not model prompts. They can be chained:
inspect -> select pattern -> transform AST/text -> generate test -> validate.
Every transformation declares its preconditions and produces auditable output.
"""
from __future__ import annotations

from dataclasses import dataclass
import ast
import re
from typing import Callable


@dataclass(frozen=True)
class Transform:
    name: str
    description: str
    apply: Callable[[str], str]


def append_function(source: str, name: str, params: str, body: str) -> str:
    if not re.fullmatch(r"[a-z_][a-z0-9_]{1,63}", name):
        raise ValueError("invalid function name")
    fragment = f"\n\ndef {name}({params}):\n    {body.replace(chr(10), chr(10) + '    ')}\n"
    candidate = source.rstrip() + fragment
    ast.parse(candidate)
    return candidate


def add_import(source: str, statement: str) -> str:
    if not re.fullmatch(r"(?:from [A-Za-z_][\w.]* import [A-Za-z_][\w]*(?:, [A-Za-z_][\w]*)*|import [A-Za-z_][\w.]*)", statement):
        raise ValueError("unsupported import statement")
    candidate = statement + "\n" + source
    ast.parse(candidate)
    return candidate


def replace_exact(source: str, old: str, new: str, *, expected_count: int = 1) -> str:
    count = source.count(old)
    if count != expected_count:
        raise ValueError(f"expected {expected_count} exact matches, found {count}")
    candidate = source.replace(old, new)
    ast.parse(candidate)
    return candidate


TRANSFORMS = {
    "append_function": Transform("append_function", "append a validated Python function", append_function),
    "add_import": Transform("add_import", "prepend a validated import", add_import),
    "replace_exact": Transform("replace_exact", "replace an exact source fragment", replace_exact),
}
