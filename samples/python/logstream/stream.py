import asyncio
import sys
import threading
import time
import websockets
import requests
import json


async def connect(url):
    async with websockets.connect(url, subprotocols=['json.webpubsub.azure.v1']) as ws:
        print('connected')
        id = 1
        while True:
            data = input()
            payload = {
                'type': 'sendToGroup',
                'group': 'stream',
                'dataType': 'text',
                'data': str(data),
                'ackId': id
            }
            id = id + 1
            await ws.send(json.dumps(payload))
            await ws.recv()

res = requests.get('http://localhost:8080/negotiate').json()

try:
    asyncio.get_event_loop().run_until_complete(connect(res['url']))
except KeyboardInterrupt:
    pass

