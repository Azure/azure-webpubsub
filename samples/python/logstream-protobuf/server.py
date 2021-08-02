import json
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from azure.messaging.webpubsubservice import (
    build_authentication_token
)

class Resquest(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.path = 'public/index.html'
            return SimpleHTTPRequestHandler.do_GET(self)
        elif self.path == '/negotiate':
            token = build_authentication_token(sys.argv[1], 'stream', roles=['webpubsub.sendToGroup.stream', 'webpubsub.joinLeaveGroup.stream'])
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'url': token['url']
            }).encode())

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('Usage: python server.py <connection-string>')
        exit(1)

    server = HTTPServer(('localhost', 8080), Resquest)
    print('server started')
    server.serve_forever()