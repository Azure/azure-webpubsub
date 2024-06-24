import json
import pytest
import asyncio
from azure.core.exceptions import HttpResponseError, ServiceRequestError
from azure.messaging.webpubsubservice._operations._operations import build_send_to_all_request
from devtools_testutils import recorded_by_proxy
from testcase import WebpubsubPowerShellPreparer, WebpubsubTest
import websockets

class TestClientConnect(WebpubsubTest):

    @pytest.mark.asyncio
    async def test_simple_websocket_client_can_connect_and_receive_messages(self):
        options = {}
        service_client = WebPubSubServiceClient(self.connection_string, 'test_simple_websocket_client_can_connect_and_receive_messages', options)

        url = await service_client.get_client_access_uri()
        async with WebSocketClient(url, self.is_simple_client_end_signal) as client:
            await client.wait_for_connected()

            text_content = 'Hello'
            await service_client.send_to_all(text_content, 'text/plain')
            json_content = {'hello': 'world'}
            await service_client.send_to_all(json.dumps(json_content), 'application/json')
            binary_content = b'Hello'
            await service_client.send_to_all(binary_content, 'application/octet-stream')

            await service_client.send_to_all(self.get_end_signal_bytes(), 'application/octet-stream')

            await client.lifetime_task()
            frames = client.received_frames

            assert len(frames) == 3
            assert frames[0].message_as_string == text_content
            assert frames[1].message_as_string == json.dumps(json_content)
            assert frames[2].message_bytes == binary_content

    @pytest.mark.asyncio
    async def test_websocket_client_with_initial_group_can_connect_and_receive_group_messages(self):
        options = {}
        service_client = WebPubSubServiceClient(self.connection_string, 'test_websocket_client_with_initial_group_can_connect_and_receive_group_messages', options)

        group = 'GroupA'
        url = await service_client.get_client_access_uri(groups=[group])
        async with WebSocketClient(url, self.is_simple_client_end_signal) as client:
            await client.wait_for_connected()

            text_content = 'Hello'
            await service_client.send_to_group(group, text_content, 'text/plain')
            json_content = {'hello': 'world'}
            await service_client.send_to_group(group, json.dumps(json_content), 'application/json')
            binary_content = b'Hello'
            await service_client.send_to_group(group, binary_content, 'application/octet-stream')

            await service_client.send_to_group(group, self.get_end_signal_bytes(), 'application/octet-stream')

            await client.lifetime_task()
            frames = client.received_frames

            assert len(frames) == 3
            assert frames[0].message_as_string == text_content
            assert frames[1].message_as_string == json.dumps(json_content)
            assert frames[2].message_bytes == binary_content

    @pytest.mark.asyncio
    async def test_subprotocol_websocket_client_can_connect_and_receive_messages(self):
        options = {}
        service_client = WebPubSubServiceClient(self.connection_string, 'test_subprotocol_websocket_client_can_connect_and_receive_messages', options)

        url = await service_client.get_client_access_uri()
        async with WebSocketClient(url, self.is_subprotocol_client_end_signal, subprotocol='json.webpubsub.azure.v1') as client:
            await client.wait_for_connected()

            text_content = 'Hello'
            await service_client.send_to_all(text_content, 'text/plain')
            json_content = {'hello': 'world'}
            await service_client.send_to_all(json.dumps(json_content), 'application/json')
            binary_content = b'Hello'
            await service_client.send_to_all(binary_content, 'application/octet-stream')

            await service_client.send_to_all(self.get_end_signal_bytes(), 'application/octet-stream')

            await client.lifetime_task()
            frames = client.received_frames

            assert len(frames) == 4
            connected = json.loads(frames[0].message_as_string)
            assert connected is not None
            assert connected['event'] == 'connected'
            assert frames[1].message_as_string == json.dumps({'type': 'message', 'from': 'server', 'dataType': 'text', 'data': text_content})
            assert frames[2].message_as_string == json.dumps({'type': 'message', 'from': 'server', 'dataType': 'json', 'data': json_content})
            assert frames[3].message_bytes == json.dumps({'type': 'message', 'from': 'server', 'dataType': 'binary', 'data': binary_content.decode()}).encode()

    def is_simple_client_end_signal(self, frame):
        bytes = frame.message_bytes
        return len(bytes) == 3 and bytes[0] == 5 and bytes[1] == 1 and bytes[2] == 1

    def is_subprotocol_client_end_signal(self, frame):
        return frame.message_as_string == json.dumps({'type': 'message', 'from': 'server', 'dataType': 'binary', 'data': 'BQEB'})

    def get_end_signal_bytes(self):
        return b'\x05\x01\x01'

class WebSocketFrame:
    def __init__(self, bytes, type):
        self.message_bytes = bytes
        self.message_as_string = bytes.decode('utf-8') if type == 'text' else None

class WebSocketClient:
    def __init__(self, uri, is_end_signal, subprotocol=None):
        self.uri = uri
        self.is_end_signal = is_end_signal
        self.subprotocol = subprotocol
        self.received_frames = []
        self.websocket = None

    async def __aenter__(self):
        self.websocket = await websockets.connect(self.uri, subprotocols=[self.subprotocol] if self.subprotocol else None)
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self.websocket.close()

    async def wait_for_connected(self):
        pass  # Implement wait for connected logic if needed

    async def lifetime_task(self):
        while True:
            message = await self.websocket.recv()
            frame = WebSocketFrame(message, self.websocket.subprotocol)
            if self.is_end_signal(frame):
                break
            self.received_frames.append(frame)
