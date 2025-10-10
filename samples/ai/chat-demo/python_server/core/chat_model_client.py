from __future__ import annotations

"""OpenAI chat model client abstraction.
"""
import logging
from typing import Iterator, Optional, List, Dict, Any
from openai import OpenAI


class OpenAIChatClient:
    def __init__(
        self,
        api_key: str,
        model_name: str,
        api_version: str = "2024-08-01-preview",
        base_url: str = "https://models.github.ai/inference",
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required for OpenAIChatClient")
        self.logger = logging.getLogger(__name__ + ".OpenAIChatClient")
        self.api_key = api_key
        self.api_version = api_version
        self.model_name = model_name
        self.client = OpenAI(
            base_url=base_url,
            api_key=api_key,
            default_query={"api-version": api_version} if api_version else None,
        )

    def chat_stream(
        self,
        text_input: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> Iterator[str]:
        """Stream assistant response tokens.

        Accepts a relaxed conversation_history of simplified dicts and coerces it into
        the minimal shape accepted by the SDK (role + content strings). Unknown keys ignored.
        """
        messages: List[Dict[str, str]] = []
        if conversation_history:
            for m in conversation_history:
                role = str(m.get("role", "user"))
                content_val = m.get("content")
                if isinstance(content_val, str):
                    messages.append({"role": role, "content": content_val})
        messages.append({"role": "user", "content": text_input})
        try:
            response = self.client.chat.completions.create(
                messages=messages,  # type: ignore[arg-type]
                model=self.model_name,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            for chunk in response:  # chunk is expected ChatCompletionChunk
                try:
                    choices = getattr(chunk, "choices", None)
                    if not choices:
                        continue
                    delta = getattr(choices[0], "delta", None)
                    content = getattr(delta, "content", None)
                    if content:
                        yield content
                except Exception:
                    continue
        except Exception:  # pragma: no cover
            self.logger.exception("chat_stream failed for input: %r", text_input)


_client_singleton: OpenAIChatClient | None = None


def get_openai_chat_client() -> OpenAIChatClient:
    global _client_singleton
    if _client_singleton is None:
        import os

        api_key = os.environ.get("GITHUB_TOKEN")
        if not api_key:
            raise ValueError("GITHUB_TOKEN environment variable is required")
        model_name = os.environ.get("MODEL_NAME", "gpt-4o-mini")
        api_version = os.environ.get("API_VERSION", "2024-08-01-preview")
        _client_singleton = OpenAIChatClient(
            api_key=api_key,
            model_name=model_name,
            api_version=api_version,
        )
    return _client_singleton


def get_chat_model() -> OpenAIChatClient:  # compatibility alias
    return get_openai_chat_client()


def chat_stream(text_input: str, **kwargs: Any) -> Iterator[str]:
    yield from get_openai_chat_client().chat_stream(text_input, **kwargs)


def chat(text_input: str, **kwargs: Any) -> str:
    return "".join(chat_stream(text_input, **kwargs))
