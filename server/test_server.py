"""Tests for the sync server.  Run:  python -m pytest server -q"""
import json
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from store import Store


def rec(id, updated, **extra):
    return {"id": id, "updatedAt": updated, **extra}


@pytest.fixture()
def store(tmp_path):
    return Store(tmp_path)


def test_last_write_wins(store):
    assert store.merge({"foods": [rec("a", 10, v="old")]}) == 1
    assert store.merge({"foods": [rec("a", 5, v="stale")]}) == 0   # older → ignored
    assert store.merge({"foods": [rec("a", 10, v="same")]}) == 0   # equal → ignored
    assert store.merge({"foods": [rec("a", 20, v="new")]}) == 1
    _, changes = store.changes_since(0)
    assert changes["foods"] == [rec("a", 20, v="new")]


def test_cursor_returns_only_newer_changes(store):
    store.merge({"foods": [rec("a", 1)], "cardio": [rec("c", 1)]})
    cursor, _ = store.changes_since(0)
    store.merge({"foods": [rec("b", 2)]})
    new_cursor, changes = store.changes_since(cursor)
    assert changes == {"foods": [rec("b", 2)]}
    assert new_cursor > cursor


def test_rejects_unknown_table_and_bad_records(store):
    with pytest.raises(ValueError):
        store.merge({"pizza": [rec("a", 1)]})
    with pytest.raises(ValueError):
        store.merge({"foods": [{"id": 1}]})


def test_keeps_14_daily_backups_in_app_format(store):
    store.merge({"bodyLogs": [rec("2026-01-01", 1, weightKg=90)]})
    start = date(2026, 1, 1)
    for i in range(20):
        store.write_daily_backup(start + timedelta(days=i))
    files = sorted(p.name for p in store.backup_dir.glob("*.json"))
    assert len(files) == 14
    assert files[0] == "cut-backup-2026-01-07.json"
    data = json.loads(store.latest_backup().read_text(encoding="utf-8"))
    assert data["app"] == "cut-tracker" and data["tables"]["bodyLogs"][0]["weightKg"] == 90


def test_api_sync_with_token(tmp_path, monkeypatch):
    monkeypatch.setenv("CUT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SYNC_TOKEN", "secret")
    import importlib
    import main
    importlib.reload(main)
    client = TestClient(main.app)

    body = {"cursor": 0, "changes": {"foods": [rec("x", 1, nameEn="كشري")]}}
    assert client.post("/sync", json=body).status_code == 401
    r = client.post("/sync", json=body, headers={"Authorization": "Bearer secret"})
    assert r.status_code == 200
    out = r.json()
    assert out["accepted"] == 1 and out["changes"]["foods"][0]["nameEn"] == "كشري"
    # Second device pulls with cursor 0, gets the record; then nothing new after the cursor.
    again = client.post("/sync", json={"cursor": out["cursor"], "changes": {}}, headers={"Authorization": "Bearer secret"}).json()
    assert again["changes"] == {}
    # CORS + private-network preflight from the GitHub Pages origin
    pre = client.options("/sync", headers={
        "Origin": "https://someone.github.io", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
        "Access-Control-Request-Private-Network": "true",
    })
    assert pre.status_code == 200
    assert pre.headers.get("access-control-allow-private-network") == "true"
