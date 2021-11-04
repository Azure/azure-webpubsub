import asyncio
import sys
import threading
import time
import websockets
from azure.messaging.webpubsubservice import (
    WebPubSubServiceClient
)


async def connect(url):
    async with websockets.connect(url) as ws:
        print('connected')
        while True:
            print(await ws.recv())

if len(sys.argv) != 3:
    print('Usage: python subscribe.py <connection-string> <hub-name>')
    exit(1)

connection_string = sys.argv[1]
hub_name = sys.argv[2]

client = WebPubSubServiceClient.from_connection_string(connection_string)
token = client.get_client_access_token(hub_name)

try:
    asyncio.get_event_loop().run_until_complete(connect(token['url']))
except KeyboardInterrupt:
    pass
