import pytest
from mirror_lab.provider import OpenAICompatibleProvider


def test_provider_requires_configuration(monkeypatch):
    monkeypatch.delenv("MIRROR_AI_ENDPOINT", raising=False)
    monkeypatch.delenv("MIRROR_AI_MODEL", raising=False)
    with pytest.raises(ValueError):
        OpenAICompatibleProvider()
