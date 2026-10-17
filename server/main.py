"""Optional home sync server for Cut Tracker.

The phone app POSTs its changed records to /sync whenever it can reach this server on
your Wi-Fi. The server merges them (last write wins per record) and keeps the last 14
daily backups in server/data/backups/ — each one can be imported back into the app.

Start it with:  python run.py      (see README for HTTPS certificate setup)
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from store import Store

DATA_DIR = Path(os.environ.get("CUT_DATA_DIR", Path(__file__).parent / "data"))
SYNC_TOKEN = os.environ.get("SYNC_TOKEN", "")
# Origins allowed to call the server from a browser. "*" is fine because a token is required.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

store = Store(DATA_DIR)
app = FastAPI(title="Cut Tracker sync", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    # Chrome asks permission before a public HTTPS page (GitHub Pages) talks to a
    # private IP like 192.168.x.x ("Private Network Access"). This answers "yes".
    allow_private_network=True,
)


def check_token(authorization: str = Header(default="")) -> None:
    if not SYNC_TOKEN:
        return
    expected = f"Bearer {SYNC_TOKEN}"
    if not secrets.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="bad token")


class SyncRequest(BaseModel):
    cursor: int = 0
    changes: dict[str, list[dict]] = {}


@app.get("/")
def home():
    latest = store.latest_backup()
    return {"ok": True, "app": "cut-tracker-sync", "latest_backup": latest.name if latest else None}


@app.post("/sync", dependencies=[Depends(check_token)])
def sync(req: SyncRequest):
    try:
        accepted = store.merge(req.changes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    cursor, changes = store.changes_since(req.cursor)
    store.write_daily_backup()
    return {"cursor": cursor, "changes": changes, "accepted": accepted}


@app.get("/backup/latest", dependencies=[Depends(check_token)])
def latest_backup():
    path = store.latest_backup()
    if not path:
        raise HTTPException(status_code=404, detail="no backups yet")
    return FileResponse(path, media_type="application/json", filename=path.name)
