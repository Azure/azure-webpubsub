import asyncio
import json
import concurrent.futures
from ai import chat_stream
from client_manager import client_manager
from utils import generate_id
from ai_chat_hub import AIChatHub
from ai_chat_service import ai_chat_service

class AIChatHub:
    async def __init__(self, context: AIChatHub):
        self.context = context
    async def on_connected(self):
        client_manager.add_client(self.context.connection_id, self.context)
    async def on_disconnected(self, connection_id):
        ai_chat_service.remove_user_from_room(self.context.room_id, connection_id)
    async def on_group_joined(self, connection_id, group):
        ai_chat_service.add_user_to_room(group, connection_id)
    async def on_event_message(self, connection_id, event_name, data):
        # should have roomId in data
        if event_name == "sendToAI":
            room_id = data.get("roomId")
            user_message = data.get("message")
            await handle_ai_response(room_id, connection_id, user_message, self.context.chat_service, self.context.send_to_group)

async def handle_ai_response(room_id, connection_id, user_message, chat_service, send_to_group):
    """Handle AI response with streaming"""
    message_id = f"message-{generate_id()}"
    try:
        conversation_history = await chat_service.get_messages(room_id)
        full_response = ""
        loop = asyncio.get_event_loop()
        def get_ai_stream():
            return list(chat_stream(user_message, conversation_history=conversation_history))
        with concurrent.futures.ThreadPoolExecutor() as executor:
            ai_chunks = await loop.run_in_executor(executor, get_ai_stream)
            for chunk in ai_chunks:
                full_response += chunk
                stream_message = {
                    "type": "message",
                    "from": "group",
                    "group": room_id,
                    "dataType": "json",
                    "data": {
                        "messageId": message_id,
                        "message": chunk,
                        "from": "AI Assistant",
                        "streaming": True
                    }
                }
                await send_to_group(room_id, json.dumps(stream_message))
                await asyncio.sleep(0.05)
        end_message = {
            "type": "message",
            "from": "group",
            "group": room_id,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "streaming": True,
                "streamingEnd": True,
                "from": "AI Assistant"
            }
        }
        await send_to_group(room_id, json.dumps(end_message))
        if full_response.strip():
            chat_service.add_message(room_id, "user", connection_id, user_message)
            chat_service.add_message(room_id, "assistant", "ai", full_response)
            print(f"AI responded in room {room_id}: {full_response[:100]}{'...' if len(full_response) > 100 else ''}")
    except Exception as e:
        print(f"Error in AI response: {e}")
        error_message = {
            "type": "message",
            "from": "group",
            "group": room_id,
            "dataType": "json",
            "data": {
                "messageId": message_id,
                "message": f"Sorry, I encountered an error: {str(e)}",
                "from": "AI Assistant",
                "streaming": False
            }
        }
        await send_to_group(room_id, json.dumps(error_message))
