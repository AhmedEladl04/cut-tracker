"""Start the sync server over HTTPS on your local network.

    python run.py

- Uses certs/cert.pem + certs/key.pem (create them with mkcert, see README).
- Creates a random SYNC_TOKEN on first run and saves it in data/token.txt.
- Prints the URL to paste into the app (More → Backup & sync).
"""
import os
import secrets
import socket
import sys
from pathlib import Path

import uvicorn

HERE = Path(__file__).parent
PORT = int(os.environ.get("PORT", "8765"))


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; just picks the LAN interface
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main() -> None:
    data = HERE / "data"
    data.mkdir(exist_ok=True)
    token_file = data / "token.txt"
    if "SYNC_TOKEN" not in os.environ:
        if not token_file.exists():
            token_file.write_text(secrets.token_urlsafe(16))
        os.environ["SYNC_TOKEN"] = token_file.read_text().strip()

    cert, key = HERE / "certs" / "cert.pem", HERE / "certs" / "key.pem"
    https = cert.exists() and key.exists()
    scheme = "https" if https else "http"
    print(f"\n  Server URL : {scheme}://{lan_ip()}:{PORT}")
    print(f"  Sync token : {os.environ['SYNC_TOKEN']}")
    print(f"  Backups    : {data / 'backups'}\n")
    if not https:
        print("  WARNING: no certs/cert.pem — running plain HTTP. The phone app (served over HTTPS)")
        print("  cannot reach an HTTP server. See README → 'Laptop sync' to create certificates.\n", file=sys.stderr)

    os.chdir(HERE)
    uvicorn.run(
        "main:app", host="0.0.0.0", port=PORT,
        ssl_certfile=str(cert) if https else None, ssl_keyfile=str(key) if https else None,
    )


if __name__ == "__main__":
    main()
