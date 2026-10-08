import io
import json

from mirror_lab import ai_provider


def test_normalize_openai_style_tool_calls():
    result = ai_provider._normalize(
        {
            "model": "test-model",
            "choices": [
                {
                    "message": {
                        "content": "research first",
                        "tool_calls": [
                            {
                                "id": "call-1",
                                "function": {
                                    "name": "research.search",
                                    "arguments": '{"query":"Taylor series"}',
                                },
                            }
                        ],
                    }
                }
            ],
        }
    )

    assert result.model == "test-model"
    assert result.content == "research first"
    assert result.tool_calls[0]["name"] == "research.search"
    assert result.tool_calls[0]["arguments"] == {"query": "Taylor series"}


def test_complete_sends_vendor_neutral_contract(monkeypatch):
    captured = {}

    class FakeResponse(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_open(request, timeout):
        captured["request"] = request
        return FakeResponse(
            json.dumps(
                {"message": {"content": "done"}, "model": "mirror-frontier"}
            ).encode()
        )

    monkeypatch.setenv("MIRROR_AI_ENDPOINT", "https://example.test/complete")
    monkeypatch.setattr(ai_provider, "urlopen", fake_open)

    response = ai_provider.complete(
        [{"role": "user", "content": "hello"}],
        [{"type": "function", "function": {"name": "research.search"}}],
    )

    payload = json.loads(captured["request"].data.decode())
    assert payload["schema_version"] == "mirror.ai_completion.v1"
    assert payload["messages"][0]["content"] == "hello"
    assert payload["tools"][0]["function"]["name"] == "research.search"
    assert response.content == "done"
