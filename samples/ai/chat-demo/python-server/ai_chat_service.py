import asyncio
import time
import json
import concurrent.futures
import websockets
from websockets.server import serve
from utils import generate_id
from ai import chat_stream
from ai_chat_manager import chat_manager
from typing import Any, Dict, Set, List, Optional

supported_protocols = ['json.reliable.webpubsub.azure.v1', 'json.webpubsub.azure.v1']

class ChatService:
    def __init__(self):
        pass
    async def start_chat(self, host, port):
        chat_server = await serve(
            websocket_handler,
            host,
            port,
            subprotocols=supported_protocols
        )
        print(f"Chat server running at ws://{host}:{port}/ws")
        return chat_server


chat_service = ChatService()

# Optional: tiny accessor & setter for tests/frameworks that want indirection
_service_ref: Optional[ChatService] = chat_service

def get_ai_chat_service() -> ChatService:
    assert _service_ref is not None, "AI chat service not initialized"
    return _service_ref

def set_ai_chat_service(new_mgr: ChatService) -> None:
    global _service_ref
    _service_ref = new_mgr

async def websocket_handler(websocket, path):
    """Handle WebSocket connections with full Web PubSub subprotocol support"""
    try:
        selected_subprotocol = websocket.subprotocol

        if selected_subprotocol not in supported_protocols:
            print("Unsupported subprotocol")
            await websocket.close()
            return

        context = chat_manager.create_client(websocket, path)
        connection_id = context.connectionId
        connected_event = {"type": "system", "event": "connected", "connectionId": connection_id}
        if selected_subprotocol:
            connected_event["subprotocol"] = selected_subprotocol
        await websocket.send(json.dumps(connected_event))
        asyncio.Queue(context.on_connected())
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get('type') == 'sendEvent':
                    message_data = data.get('data', {})
                    user_message = message_data.get('message', '') if isinstance(message_data, dict) else str(message_data)
                    eventName = message_data.get('eventName')
                    no_echo = message_data.get('noEcho', False)
                    print(f'Received message for event {eventName}: {user_message}')
                    if not user_message.strip():
                        continue
                    asyncio.Queue(context.on_event_message(connection_id, eventName, message_data))
                if data.get('type') == 'sendToGroup':
                    message_data = data.get('data', {})
                    user_message = message_data.get('message', '') if isinstance(message_data, dict) else str(message_data)
                    user_name = message_data.get('from')
                    group_name = message_data.get('group')
                    no_echo = message_data.get('noEcho', False)
                    print(f'Received message from {user_name} in group {group_name}: {user_message}')
                    if not user_message.strip():
                        continue
                    await ClientManager.send_to_group(group_name, message_data, [connection_id] if no_echo else [])
                elif data.get('type') == 'joinGroup':
                    group_name = data.get('group')
                    if group_name is None:
                        ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": False, "error": "Group name is required"}
                        print(f"Invalid group name: {group_name}")
                    else:
                        await ClientManager.add_client_to_group(connection_id, group_name)
                        ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": True}
                        print(f"Client joined group: {group_name}")
                    await websocket.send(json.dumps(ack_message))
                elif data.get('type') == 'leaveGroup':
                    group_name = data.get('group')
                    if group_name is None:
                        ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": False, "error": "Group name is required"}
                        print(f"Invalid group name: {group_name}")
                    else:
                        await ClientManager.remove_client_from_group(connection_id, group_name)
                        ack_message = {"type": "ack", "ackId": data.get('ackId', 1), "success": True}
                        print(f"Client left group: {group_name}")
                    await websocket.send(json.dumps(ack_message))
                elif data.get('type') == 'sequenceAck':
                    break
                else:
                    print(f"Unknown message type: {data.get('type')}")
            except json.JSONDecodeError:
                print("Invalid JSON received")
            except Exception as e:
                print(f"Error handling message: {e}")
    except websockets.exceptions.ConnectionClosed:
        print("WebSocket connection closed")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        try:
            context = ClientManager.get_client(connection_id)
            if context:
                asyncio.Queue(context.on_disconnected())
        except Exception as e:
            print(f"Error during disconnection: {e}")
        await ClientManager.remove_client(connection_id)
        print(f"Client disconnected: {connection_id}")
