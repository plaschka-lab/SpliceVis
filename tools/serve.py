#!/usr/bin/env python3
"""Serve SpliceVis on loopback; choose a free port if the preferred one is busy."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


class OfflineTestHandler(SimpleHTTPRequestHandler):
    """Reject external subresources so a warm browser cache cannot hide omissions."""
    def end_headers(self):
        self.send_header('Content-Security-Policy',
            "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
            "font-src 'self' data:; worker-src 'self' blob:; frame-src 'self'")
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true')
    parser.add_argument('--offline-test', action='store_true', help='Block external subresources with Content Security Policy.')
    args = parser.parse_args()
    handler = partial(OfflineTestHandler if args.offline_test else SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parents[1]))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError:
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    url = f'http://127.0.0.1:{server.server_port}/'
    print(url, flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
