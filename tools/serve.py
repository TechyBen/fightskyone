"""Serve ext/ for testing: the sky page on its own
(http://localhost:8201/sky/index.html?demo=1&fly=1), or the content script
injected into bsky.app. No caching, plus the CORS and Private Network Access
headers Chrome needs before a public page may load scripts from localhost.

    python tools/serve.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

EXT = Path(__file__).resolve().parent.parent / 'ext'


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8201
ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(EXT))).serve_forever()
