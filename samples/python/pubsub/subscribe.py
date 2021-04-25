import sys
import threading
import time
import websocket
from azure.messaging.webpubsubservice import (
    build_authentication_token
)


class WebsocketClient(threading.Thread):
    def __init__(self, ws):
        threading.Thread.__init__(self)
        self.ws = ws

    def run(self):
        print('connected')
        try:
            while True:
                print(self.ws.recv())
        except:
            pass

    def join(self):
        self.ws.close()
        super().join()


if len(sys.argv) != 3:
    print('Usage: python subscribe.py <connection-string> <hub-name>')
    exit(1)

connection_string = sys.argv[1]
hub_name = sys.argv[2]

token = build_authentication_token(connection_string, hub_name)
ws = websocket.create_connection(token['url'])
ws_client = WebsocketClient(ws)
ws_client.daemon = True
ws_client.start()

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    pass

ws_client.join()
