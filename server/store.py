"""Storage for the sync server: one SQLite file + daily JSON backups.

Every record from the phone has an `id` and an `updatedAt` (ms). Merging is
last-write-wins per record: we keep whichever version has the larger updatedAt.
Each accepted write gets an increasing `seq` number; a client asks for
"everything after seq N" to receive changes it hasn't seen.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

KNOWN_TABLES = {
    "settings", "sessions", "swaps", "foods", "recipes",
    "foodLogs", "bodyLogs", "cardio", "oneRmHistory",
}
KEEP_BACKUPS = 14


class Store:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.backup_dir = self.data_dir / "backups"
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.data_dir / "sync.db", check_same_thread=False)
        self.db.execute(
            """CREATE TABLE IF NOT EXISTS records (
                   tbl TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL,
                   seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tbl, id))"""
        )
        self.db.execute("CREATE INDEX IF NOT EXISTS records_seq ON records(seq)")
        self.db.commit()

    def _max_seq(self) -> int:
        return self.db.execute("SELECT COALESCE(MAX(seq), 0) FROM records").fetchone()[0]

    def merge(self, changes: dict[str, list[dict]]) -> int:
        """Apply incoming records (last write wins). Returns how many were accepted."""
        accepted = 0
        seq = self._max_seq()
        with self.db:  # one transaction
            for tbl, rows in changes.items():
                if tbl not in KNOWN_TABLES:
                    raise ValueError(f"unknown table {tbl!r}")
                for row in rows:
                    rid, upd = row.get("id"), row.get("updatedAt")
                    if not isinstance(rid, str) or not isinstance(upd, (int, float)):
                        raise ValueError(f"bad record in {tbl}")
                    cur = self.db.execute(
                        "SELECT updated_at FROM records WHERE tbl=? AND id=?", (tbl, rid)
                    ).fetchone()
                    if cur is not None and cur[0] >= upd:
                        continue  # server already has the same or a newer version
                    seq += 1
                    self.db.execute(
                        "INSERT OR REPLACE INTO records (tbl, id, updated_at, seq, data) VALUES (?,?,?,?,?)",
                        (tbl, rid, int(upd), seq, json.dumps(row, ensure_ascii=False)),
                    )
                    accepted += 1
        return accepted

    def changes_since(self, cursor: int) -> tuple[int, dict[str, list[dict]]]:
        out: dict[str, list[dict]] = {}
        for tbl, data in self.db.execute("SELECT tbl, data FROM records WHERE seq > ? ORDER BY seq", (cursor,)):
            out.setdefault(tbl, []).append(json.loads(data))
        return self._max_seq(), out

    def snapshot(self) -> dict:
        """Everything, in the same format as the app's "Export backup" (so it can be imported)."""
        tables: dict[str, list[dict]] = {t: [] for t in sorted(KNOWN_TABLES)}
        for tbl, data in self.db.execute("SELECT tbl, data FROM records ORDER BY tbl, id"):
            tables[tbl].append(json.loads(data))
        return {
            "app": "cut-tracker",
            "version": 1,
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "tables": tables,
        }

    def write_daily_backup(self, today: date | None = None) -> Path:
        """Write/overwrite today's backup file, then delete all but the newest 14."""
        today = today or date.today()
        path = self.backup_dir / f"cut-backup-{today.isoformat()}.json"
        path.write_text(json.dumps(self.snapshot(), ensure_ascii=False), encoding="utf-8")
        backups = sorted(self.backup_dir.glob("cut-backup-*.json"))
        for old in backups[:-KEEP_BACKUPS]:
            old.unlink()
        return path

    def latest_backup(self) -> Path | None:
        backups = sorted(self.backup_dir.glob("cut-backup-*.json"))
        return backups[-1] if backups else None
