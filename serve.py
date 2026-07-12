"""開発・iPad配信用の簡易サーバー: python3 serve.py [port]"""
import os
import sys
import http.server
import socketserver

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app'))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.webmanifest': 'application/manifest+json',
        '.js': 'text/javascript',
    }

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('0.0.0.0', port), Handler) as httpd:
    print(f'serving app/ on http://0.0.0.0:{port}')
    httpd.serve_forever()
