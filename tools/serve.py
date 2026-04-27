#!/usr/bin/env python3
"""
serve.py — tiny static file server for Maqueen Lab.

Why this exists
---------------
Open `index.html` directly via `file:///` and Chromium blocks `fetch()` for
`manifest.json`, `product.json`, `build-info.json` etc. with a CORS error.
The app degrades gracefully (those failures are non-fatal), but the console
fills with red noise. Serving over HTTP from `localhost` makes them load
cleanly and lets the Service Worker register too.

Usage
-----
From the project root:

    python tools/serve.py            # binds to 8000
    python tools/serve.py 8765       # custom port
    npm run serve                    # equivalent (uses npx serve)

Then open http://localhost:8000 in Chrome / Edge.

This script is intentionally dependency-free — uses stdlib only (Python 3.7+).
"""
from __future__ import annotations

import http.server
import os
import socketserver
import sys
import webbrowser
from pathlib import Path


def main() -> int:
    # Default port 8000; override with first arg.
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port: {sys.argv[1]!r}", file=sys.stderr)
            return 2

    # Serve the project root (parent of tools/), not the cwd of invocation.
    root = Path(__file__).resolve().parent.parent
    os.chdir(root)

    handler = http.server.SimpleHTTPRequestHandler
    # Allow re-bind without TIME_WAIT delay (handy when toggling the server).
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer(("", port), handler) as httpd:
            url = f"http://localhost:{port}/"
            print(f"Maqueen Lab serving at {url}")
            print(f"Root: {root}")
            print("Ctrl-C to stop.")
            # Open the browser only on first launch — not always desired,
            # so make it opt-out via env var.
            if os.environ.get("MAQUEEN_NO_BROWSER") != "1":
                try:
                    webbrowser.open(url)
                except Exception:
                    pass
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        return 0
    except OSError as e:
        # Port busy is the common case — give a useful message.
        if getattr(e, "errno", None) == 98 or "in use" in str(e).lower() or "10048" in str(e):
            print(f"Port {port} is already in use. Try: python tools/serve.py {port + 1}",
                  file=sys.stderr)
            return 3
        raise
    return 0


if __name__ == "__main__":
    sys.exit(main())
