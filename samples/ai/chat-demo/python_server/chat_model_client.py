"""Chat model client abstraction.

Provides streaming completions from a chat-oriented LLM endpoint.
"""
from __future__ import annotations

import os
import logging
from typing import Iterator, Optional, List, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class ChatModelClient:
    """LLM chat/completions client with streaming support.

    Focuses on:
      - minimal external surface (chat_stream + helper wrappers)
      - provider-agnostic naming (no vendor in class name)
    """
    def __init__(self) -> None:
        self.logger = logging.getLogger(__name__ + ".ChatModelClient")
        self.api_key = os.environ.get("GITHUB_TOKEN")
        self.api_version = os.environ.get("API_VERSION", "2024-08-01-preview")
        self.model_name = os.environ.get("MODEL_NAME", "gpt-4o-mini")
        if not self.api_key:
            raise ValueError("GITHUB_TOKEN environment variable is required")
        self.client = OpenAI(
            base_url="https://models.github.ai/inference",
            api_key=self.api_key,
            default_query={"api-version": self.api_version},
        )

    def chat_stream(self, text_input: str, conversation_history: Optional[List[Dict[str, Any]]] = None,
                    temperature: float = 0.7, max_tokens: Optional[int] = None) -> Iterator[str]:
        """
        Generates a stream of chat response content from the model based on user input and optional conversation history.

        Args:
            text_input (str): The user's input message to send to the chat model.
            conversation_history (Optional[List[Dict[str, Any]]], optional): Previous messages in the conversation, if any.
            temperature (float, optional): Sampling temperature for response generation. Defaults to 0.7.
            max_tokens (Optional[int], optional): Maximum number of tokens in the response. If None, uses model default.

        Yields:
            str: Incremental pieces of the model's response content as they are generated.

        Logs:
            Exceptions encountered during streaming are logged with the input text.
        """
        messages: List[Dict[str, Any]] = []
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": text_input})
        try:
            response = self.client.chat.completions.create(
                messages=messages,
                model=self.model_name,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    if not content:
                        continue
                    yield content
        except Exception:
            self.logger.exception("chat_stream failed for input: %r", text_input)

_client_singleton: ChatModelClient | None = None

def get_chat_model() -> ChatModelClient:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = ChatModelClient()
    return _client_singleton

# Convenience wrappers

def chat_stream(text_input: str, **kwargs) -> Iterator[str]:
    yield from get_chat_model().chat_stream(text_input, **kwargs)

def chat(text_input: str, **kwargs) -> str:
    return "".join(chat_stream(text_input, **kwargs))

