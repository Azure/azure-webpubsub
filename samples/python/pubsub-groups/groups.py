# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

import json
import asyncio
import websockets
from azure.messaging.webpubsubservice import WebPubSubServiceClient
import queue


# Provides bi-directional connection to given Azure Web PubSub service group.
class WebPubSubGroup:
    def __init__(self, webpubsub_constr, hub_name, user_name, group_name):
        self.webpubsub_constr = webpubsub_constr
        self.client = None
        self.listeners = []
        self.closed = True
        self.user_name = user_name
        self.hub_name = hub_name
        self.group_name = group_name
        self.ack_id = 1
        self.web_socket = None
        self.send_queue = queue.Queue()

    def add_listener(self, handler):
        self.listeners += [handler]

    async def connect(self):
        self.client = WebPubSubServiceClient.from_connection_string(
            connection_string=self.webpubsub_constr, hub=self.hub_name)
        self.closed = False
        token = self.client.get_client_access_token(
            user_id=self.user_name,
            roles=[f"webpubsub.joinLeaveGroup.{self.group_name}",
                   f"webpubsub.sendToGroup.{self.group_name}"])
        uri = token['url']
        self.web_socket = await websockets.connect(
            uri, subprotocols=['json.webpubsub.azure.v1'])
        response = await self._send_receive({
            "type": "joinGroup",
            "ackId": self.ack_id,
            "group": self.group_name})
        self.ack_id += 1
        # now we should have the connection id and an idea of success
        if "event" in response and response["event"] == "connected":
            self.connection_id = response["connectionId"]
        print("WebSocket connected")
        return

    def send(self, msg):
        groupMessage = {
            "type": "sendToGroup",
            "group": self.group_name,
            "dataType": "json",
            "data": msg,
            "ackId": self.ack_id
        }
        self.ack_id += 1
        self.send_queue.put(groupMessage)

    async def consume(self):
        while not self.closed:
            if not self.send_queue.empty():
                message = self.send_queue.get()
                if message:
                    data = json.dumps(message)
                    await self.web_socket.send(data)
            else:
                await asyncio.sleep(0.1)

        if self.web_socket:
            try:
                await self.web_socket.close()
            except Exception as e:
                print(e)

    async def listen(self):
        print("Listening for messages from WebSocket...")
        async for message in self.web_socket:
            self._handle_message(message)
            if not self.client:
                break
        print("Stopped listening to WebSocket.")

    def _handle_message(self, data):
        # print("Message received: " + data)
        message = json.loads(data)
        if "fromUserId" in message:
            user = message["fromUserId"]
            if user != self.user_name:
                for h in self.listeners:
                    h(user, message)

    async def _send_receive(self, msg):
        data = json.dumps(msg)
        await self.web_socket.send(data)
        response = await self.web_socket.recv()
        return json.loads(response)

    def close(self):
        if self.client:
            try:
                self.client.close()
            except Exception as e:
                print(e)
        self.closed = True
