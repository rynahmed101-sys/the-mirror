from mirror_lab.research import ResearchPlan, ResearchRecord, ResearchTool
from mirror_lab.scientific_policy import build_work_order, rank_evidence, require_reference_pass


class StubProvider:
    def __init__(self, name, established_reference, records):
        self.name = name
        self.established_reference = established_reference
        self.records = records

    def search(self, query, limit=5):
        return self.records[:limit]


def test_reference_first_ordering_and_ranking():
    reference = ResearchRecord("openalex", "Newtonian mechanics", "doi:test", "paper", established_reference=True)
    frontier = ResearchRecord("arxiv", "Speculative dynamics", "arxiv:test", "preprint", established_reference=False)
    tool = ResearchTool((
        StubProvider("arxiv", False, [frontier]),
        StubProvider("openalex", True, [reference]),
    ))
    result = tool.search(ResearchPlan("mechanics"))
    assert result["provider_order"] == ["openalex", "arxiv"]
    assert result["records"][0]["established_reference"] is True


def test_reference_gate_does_not_require_agreement():
    records = [
        {"provider": "openalex", "established_reference": True, "kind": "paper", "score": 1},
        {"provider": "arxiv", "established_reference": False, "kind": "preprint", "score": 1000},
    ]
    require_reference_pass(records)
    ranked = rank_evidence(records)
    assert ranked[0]["provider"] == "openalex"


def test_work_order_allows_novelty():
    order = build_work_order("test new relation")
    assert order.reference_required is True
    assert order.novelty_allowed is True
