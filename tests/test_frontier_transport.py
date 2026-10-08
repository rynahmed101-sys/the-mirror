from io import BytesIO

import pytest

from mirror_lab.frontier import (
    ChanfanaFrontierClient,
    FrontierLimits,
    FrontierMission,
    FrontierPermissions,
    FrontierRequest,
    FrontierTransportError,
)


class _Response:
    def __init__(self, payload: dict):
        self.data = BytesIO(__import__("json").dumps(payload).encode())

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, limit=0):
        return self.data.read(limit) if limit else self.data.read()


def _request() -> FrontierRequest:
    return FrontierRequest(
        request_id="frontier_test_12345678",
        action_cycle_id="cycle_test_12345678",
        capability_id="stage1b.series_expansions",
        capability_name="Taylor/Maclaurin series",
        task="Implement bounded series expansion support",
        base_revision="a" * 40,
        mirror_endpoint="https://mirror.example/frontier",
        mission=FrontierMission(
            ledger_frontier=("stage1b.series_expansions",),
            required_action="implement",
        ),
    )


def test_frontier_request_is_fail_closed_on_mutation_permissions():
    with pytest.raises(ValueError):
        FrontierPermissions(canonical_mutation=True)
    with pytest.raises(ValueError):
        FrontierPermissions(remote_git_mutation=True)


def test_frontier_limits_are_bounded():
    with pytest.raises(ValueError):
        FrontierLimits(max_tool_steps=33)
    with pytest.raises(ValueError):
        FrontierLimits(deadline_ms=999)


def test_frontier_client_submits_exact_request_id_and_classifies_output_as_untrusted():
    calls = []

    def opener(request, timeout=0):
        calls.append((request, timeout))
        return _Response({
            "success": True,
            "jobId": "job-1",
            "state": "queued",
            "requestId": "frontier_test_12345678",
        })

    client = ChanfanaFrontierClient("https://chanfana.example", "token", opener=opener)
    queued = client.submit(_request())
    assert queued["jobId"] == "job-1"
    body = __import__("json").loads(calls[0][0].data.decode())
    assert body["schema_version"] == "mirror.frontier_job.v1"
    assert body["permissions"]["canonical_mutation"] is False
    assert body["permissions"]["remote_git_mutation"] is False

    classified = client.classify_result({
        "job": {"id": "job-1", "request_id": "frontier_test_12345678", "state": "succeeded",
                "result": {"claim": "something"}},
    })
    assert classified["authority"] == "UNTRUSTED_TRANSPORT_RESULT"
    assert classified["result"]["claim"] == "something"


def test_frontier_client_rejects_mismatched_request_id():
    client = ChanfanaFrontierClient(
        "https://chanfana.example",
        "token",
        opener=lambda *_args, **_kwargs: _Response({
            "success": True,
            "jobId": "job-1",
            "state": "queued",
            "requestId": "other-request",
        }),
    )
    with pytest.raises(FrontierTransportError):
        client.submit(_request())


def test_frontier_tool_is_authorized_and_source_revision_bound(monkeypatch):
    from mirror_lab.frontier import frontier_tool_spec
    from mirror_lab.tooling import ToolContext
    from mirror_lab.reasoning import SpecialistName

    class FakeClient:
        def submit(self, request):
            return {
                "success": True,
                "jobId": "job-2",
                "state": "queued",
                "requestId": request.request_id,
            }

    spec = frontier_tool_spec(FakeClient())
    request = _request()
    denied = spec.handler if False else None
    client_result = spec.handler(
        request,
        ToolContext(
            cycle_id="cycle_test_12345678",
            mission_id="mission_test_12345678",
            objective="submit frontier mission",
            specialist=SpecialistName.REASONING,
            source_revision="a" * 40,
            authorization_granted=True,
        ),
    )
    assert client_result["authority"] == "UNTRUSTED_TRANSPORT_ACK"

    with pytest.raises(__import__("mirror_lab.frontier", fromlist=["FrontierTransportError"]).FrontierTransportError):
        spec.handler(
            request,
            ToolContext(
                cycle_id="cycle_test_12345678",
                mission_id="mission_test_12345678",
                objective="submit frontier mission",
                specialist=SpecialistName.REASONING,
                source_revision="b" * 40,
                authorization_granted=True,
            ),
        )
