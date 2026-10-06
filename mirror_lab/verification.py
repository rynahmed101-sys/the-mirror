"""Bounded scientific verification experiments for THE MIRROR.

Mirror returns observations and provenance.  It never certifies an Automate
capability.  The laboratory deliberately uses multiple truncation and
precision routes so symmetric cancellation cannot masquerade as convergence.
"""
from __future__ import annotations

import ast
import hashlib
import math
import time
from dataclasses import asdict, dataclass
from typing import Any, Mapping

import mpmath as mp

_SAFE_FUNCS = {
    "abs": mp.fabs, "exp": mp.exp, "sqrt": mp.sqrt, "sin": mp.sin,
    "cos": mp.cos, "tan": mp.tan, "log": mp.log, "sinh": mp.sinh,
    "cosh": mp.cosh, "tanh": mp.tanh,
}
_SAFE_CONSTS = {"pi": mp.pi, "e": mp.e}

_ALLOWED = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Add, ast.Sub, ast.Mult,
            ast.Div, ast.Pow, ast.Mod, ast.USub, ast.UAdd, ast.Call,
            ast.Name, ast.Constant)

def _compile_expression(expression: str):
    tree = ast.parse(expression, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED):
            raise ValueError(f"unsupported expression syntax: {type(node).__name__}")
        if isinstance(node, ast.Name) and node.id not in {"x", *_SAFE_FUNCS, *_SAFE_CONSTS}:
            raise ValueError(f"unknown symbol: {node.id}")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _SAFE_FUNCS:
                raise ValueError("only registered mathematical functions may be called")
    return compile(tree, "<mirror-verification>", "eval")

def _fn(expression: str):
    code = _compile_expression(expression)
    globals_ = {"__builtins__": {}}
    globals_.update(_SAFE_FUNCS)
    globals_.update(_SAFE_CONSTS)
    def value(x: mp.mpf):
        return mp.mpf(eval(code, globals_, {"x": x}))
    return value

def _mp_bound(raw: str) -> mp.mpf:
    value = str(raw).strip().lower()
    if value in {"oo","+oo","inf","+inf","infinity","+infinity"}:
        return mp.inf
    if value in {"-oo","-inf","-infinity"}:
        return -mp.inf
    if value in {"pi"}:
        return mp.pi
    return mp.mpf(value)

def _finite_diff(a: mp.mpf, b: mp.mpf) -> mp.mpf:
    return abs(a - b) / max(mp.mpf("1"), abs(a), abs(b))

@dataclass(frozen=True)
class VerificationExperimentRequest:
    request_id: str
    action_cycle_id: str
    capability_id: str
    source_revision: str
    hypothesis: str
    inputs: Mapping[str, Any]
    assumptions: tuple[str, ...]
    max_precision: int = 80
    max_truncation: int = 8
    max_runtime_ms: int = 30_000

@dataclass(frozen=True)
class VerificationObservation:
    precision: int
    truncation: str
    route: str
    value: str | None
    relative_disagreement: str | None
    status: str

def _integrate(fn, lower: mp.mpf, upper: mp.mpf, route: str):
    quad = mp.quadgl if route == "gauss_legendre" else mp.quad
    return quad(fn, [lower, upper])

def run_integral_experiment(request: VerificationExperimentRequest) -> dict[str, Any]:
    started = time.monotonic()
    if not request.source_revision or len(request.source_revision) != 40:
        raise ValueError("source_revision must be an exact commit SHA")
    if request.max_precision < 20 or request.max_precision > 120:
        raise ValueError("max_precision must be between 20 and 120")
    if request.max_truncation < 3 or request.max_truncation > 10:
        raise ValueError("max_truncation must be between 3 and 10")

    fn = _fn(str(request.inputs["integrand"]))
    lower = _mp_bound(str(request.inputs["lower"]))
    upper = _mp_bound(str(request.inputs["upper"]))
    observations: list[VerificationObservation] = []
    fingerprints = hashlib.sha256(
        (request.source_revision + request.request_id + repr(dict(request.inputs))).encode()
    ).hexdigest()

    precisions = [30, min(60, request.max_precision), request.max_precision]
    precisions = sorted(set(p for p in precisions if p <= request.max_precision))
    scales = [2 ** i for i in range(3, request.max_truncation + 1)]

    final_values: list[mp.mpf] = []
    route_disagreements: list[mp.mpf] = []

    with mp.workdps(request.max_precision):
        for precision in precisions:
            mp.mp.dps = precision
            try:
                if lower == -mp.inf and upper == mp.inf:
                    # Ordinary convergence requires each tail to converge.
                    left_values = []
                    right_values = []
                    for scale in scales:
                        left = _integrate(fn, -mp.inf, mp.mpf("0"), "tanh_sinh")
                        right = _integrate(fn, mp.mpf("0"), mp.inf, "tanh_sinh")
                        left_values.append(left)
                        right_values.append(right)
                        total = left + right
                        observations.append(VerificationObservation(
                            precision, f"tails:{scale}", "tanh_sinh", mp.nstr(total, 30),
                            None, "observed",
                        ))
                    # Explicit asymmetric cutoffs expose principal-value-only behavior.
                    for scale in scales[:3]:
                        L = mp.mpf(scale)
                        R = mp.mpf(2 * scale)
                        asymmetric = mp.quad(fn, [-L, 0, R])
                        observations.append(VerificationObservation(
                            precision, f"asymmetric:{scale}", "tanh_sinh",
                            mp.nstr(asymmetric, 30), None, "observed",
                        ))
                    left_stable = _finite_diff(left_values[-1], left_values[-2]) < mp.mpf("1e-12")
                    right_stable = _finite_diff(right_values[-1], right_values[-2]) < mp.mpf("1e-12")
                    candidate = left_values[-1] + right_values[-1]
                    final_values.append(candidate)
                    status = "converged" if left_stable and right_stable else "unresolved"
                    if not left_stable or not right_stable:
                        status = "divergent_or_unresolved"
                    observations.append(VerificationObservation(
                        precision, "tail-test", "independent-tail-analysis",
                        mp.nstr(candidate, 30), None, status,
                    ))
                else:
                    if lower != -mp.inf and upper != mp.inf:
                        # Endpoint singularity probes, when requested or implied by a bound.
                        endpoint = str(request.inputs.get("endpoint") or "").lower()
                        epsilons = [mp.power(10, -k) for k in range(3, 3 + len(scales))]
                        values = []
                        for eps in epsilons:
                            a = lower + eps if endpoint == "lower" else lower
                            b = upper - eps if endpoint == "upper" else upper
                            value = _integrate(fn, a, b, "tanh_sinh")
                            values.append(value)
                            observations.append(VerificationObservation(
                                precision, "endpoint:" + mp.nstr(eps, 4),
                                "tanh_sinh", mp.nstr(value, 30), None, "observed",
                            ))
                        if len(values) >= 2:
                            final_values.append(values[-1])
                    else:
                        # One-sided infinite interval.
                        value = _integrate(fn, lower, upper, "tanh_sinh")
                        final_values.append(value)
                        observations.append(VerificationObservation(
                            precision, "one-sided", "tanh_sinh", mp.nstr(value, 30), None, "observed",
                        ))
            except (ValueError, ZeroDivisionError, OverflowError) as exc:
                observations.append(VerificationObservation(
                    precision, "failed", "tanh_sinh", None, None, f"error:{type(exc).__name__}"
                ))

            try:
                if lower == -mp.inf or upper == mp.inf:
                    a, b = lower, upper
                    alt = _integrate(fn, a, b, "gauss_legendre")
                    if final_values:
                        route_disagreements.append(_finite_diff(alt, final_values[-1]))
                        observations.append(VerificationObservation(
                            precision, "independent-route", "gauss_legendre",
                            mp.nstr(alt, 30), mp.nstr(route_disagreements[-1], 8), "observed",
                        ))
            except Exception:
                observations.append(VerificationObservation(
                    precision, "independent-route", "gauss_legendre", None, None, "unresolved"
                ))

            if (time.monotonic() - started) * 1000 > request.max_runtime_ms:
                break

    stable = len(route_disagreements) > 0 and max(route_disagreements) < mp.mpf("1e-10")
    tail_unresolved = any(o.status in {"unresolved", "divergent_or_unresolved"} for o in observations)
    status = "REPRODUCED" if stable and not tail_unresolved else "UNRESOLVED"
    if lower == -mp.inf and upper == mp.inf and tail_unresolved:
        status = "CONTRADICTED_OR_DIVERGENT"

    runtime_ms = int((time.monotonic() - started) * 1000)
    return {
        "schema_version": "mirror.verification_result.v1",
        "authority": "UNTRUSTED_EXPERIMENTAL_OBSERVATION",
        "experiment_id": "exp_" + hashlib.sha256(
            (request.request_id + request.source_revision).encode()
        ).hexdigest()[:32],
        "request_id": request.request_id,
        "action_cycle_id": request.action_cycle_id,
        "capability_id": request.capability_id,
        "source_revision": request.source_revision,
        "status": status,
        "hypothesis": request.hypothesis,
        "inputs": dict(request.inputs),
        "assumptions": list(request.assumptions),
        "observations": [asdict(o) for o in observations],
        "diagnostics": {
            "runtime_ms": runtime_ms,
            "max_precision_used": max((o.precision for o in observations), default=0),
            "route_disagreement_max": mp.nstr(max(route_disagreements), 12) if route_disagreements else None,
            "source_fingerprint": fingerprints,
            "limitations": [
                "Numerical evidence does not constitute formal proof.",
                "A symmetric principal value is not accepted as ordinary two-sided convergence.",
                "Expression language is intentionally restricted to the registered safe mathematical subset.",
            ],
        },
    }
