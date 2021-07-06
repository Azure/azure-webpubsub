import asyncio
import sys
import threading
import time
import websockets
import requests
import json
from pubsub_pb2 import UpstreamMessage


async def connect(url):
    async with websockets.connect(url, subprotocols=['protobuf.webpubsub.azure.v1']) as ws:
        print('connected')
        id = 1
        while True:
            data = input()

            upstream = UpstreamMessage()
            upstream.send_to_group_message.group = 'stream'
            upstream.send_to_group_message.ack_id = id
            upstream.send_to_group_message.data.text_data = str(data)

            id = id + 1
            await ws.send(upstream.SerializeToString())
            await ws.recv()

res = requests.get('http://localhost:8081/negotiate').json()

try:
    asyncio.get_event_loop().run_until_complete(connect(res['url']))
except KeyboardInterrupt:
    pass

