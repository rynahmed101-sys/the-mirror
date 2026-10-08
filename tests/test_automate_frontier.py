from mirror_lab.automate import AutomateFrontierSnapshot, read_automate_frontier


class _Response:
    def __init__(self, body: bytes):
        self.body = body
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def read(self, _limit=0): return self.body


def test_automate_frontier_snapshot_is_read_only_and_hashed(monkeypatch):
    payloads = iter([
        b"# ledger\n- [ ] stage1b.series_expansions\n",
        b'{"capabilities":[{"id":"stage1b.series_expansions","implementation_state":"planned"}]}',
    ])

    def fake_open(req, timeout=20):
        return _Response(next(payloads))

    monkeypatch.setattr("mirror_lab.automate.urlopen", fake_open)
    snapshot = read_automate_frontier()
    assert isinstance(snapshot, AutomateFrontierSnapshot)
    assert snapshot.authority == "AUTOMATE_CANONICAL_READ_ONLY"
    assert snapshot.ledger_sha256
    assert snapshot.inventory_sha256
    assert snapshot.inventory["capabilities"][0]["id"] == "stage1b.series_expansions"
