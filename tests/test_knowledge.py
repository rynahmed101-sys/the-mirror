from mirror_lab.knowledge import search

def test_knowledge_search_returns_procedures():
    rows = search("repair failed CI test")
    assert rows
    assert any("change-strategy" in x.procedure for x in rows)
