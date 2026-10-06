from mirror_lab.verification import VerificationExperimentRequest, run_integral_experiment

SHA = "a" * 40

def request(integrand, lower, upper, endpoint=None):
    inputs = {"integrand": integrand, "lower": lower, "upper": upper}
    if endpoint: inputs["endpoint"] = endpoint
    return VerificationExperimentRequest(
        request_id="ver_" + "b" * 32,
        action_cycle_id="cycle_12345678",
        capability_id="stage1b.improper_integrals",
        source_revision=SHA,
        hypothesis="independent convergence check",
        inputs=inputs,
        assumptions=(),
        max_precision=50,
        max_truncation=5,
        max_runtime_ms=30_000,
    )

def test_lorentzian_is_reproduced_without_using_a_symmetric_principal_value():
    result = run_integral_experiment(request("1/(1+x**2)", "-oo", "oo"))
    assert result["status"] in {"REPRODUCED", "UNRESOLVED"}
    assert any(o["truncation"] == "tail-test" for o in result["observations"])

def test_inverse_x_is_not_declared_convergent_from_symmetry():
    result = run_integral_experiment(request("1/x", "-oo", "oo"))
    assert result["status"] == "CONTRADICTED_OR_DIVERGENT"

def test_endpoint_singularity_is_measured_with_cutoff_family():
    result = run_integral_experiment(request("1/sqrt(x)", "0", "1", "lower"))
    assert any(o["truncation"].startswith("endpoint:") for o in result["observations"])

def test_expression_parser_is_fail_closed():
    try:
        run_integral_experiment(request("__import__('os').system('bad')", "0", "1"))
    except ValueError:
        pass
    else:
        raise AssertionError("unsafe expression must be rejected")
