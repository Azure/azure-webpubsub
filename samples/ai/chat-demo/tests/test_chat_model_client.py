from typing import Any, Dict, List

import pytest

from python_server.core import chat_model_client


class _DummyDelta:
    def __init__(self, content: str) -> None:
        self.content = content


class _DummyChoice:
    def __init__(self, content: str) -> None:
        self.delta = _DummyDelta(content)


class _DummyChunk:
    def __init__(self, content: str) -> None:
        self.choices = [_DummyChoice(content)]


class _DummyCompletions:
    def __init__(self, owner: "_DummyOpenAI") -> None:
        self._owner = owner

    def create(
        self,
        *,
        messages: List[Dict[str, Any]],
        model: str,
        stream: bool,
        temperature: float | None = None,
        top_p: float | None = None,
        **kwargs: Any,
    ):
        self._owner.last_kwargs = {
            "messages": messages,
            "model": model,
            "stream": stream,
            "temperature": temperature,
            "top_p": top_p,
            **kwargs,
        }
        yield _DummyChunk("stub-response")


class _DummyChat:
    def __init__(self, owner: "_DummyOpenAI") -> None:
        self.completions = _DummyCompletions(owner)


class _DummyOpenAI:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self.args = args
        self.kwargs = kwargs
        self.chat = _DummyChat(self)
        self.last_kwargs: Dict[str, Any] | None = None


@pytest.fixture(autouse=True)
def _patch_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(chat_model_client, "OpenAI", _DummyOpenAI)


def test_chat_client_injects_config_system_prompt_with_role(monkeypatch: pytest.MonkeyPatch) -> None:
    client = chat_model_client.OpenAIChatClient(
        api_key="token",
        model_name="openai/gpt-5",
        api_version="2024-08-01-preview",
        model_parameters={"temperature": 0.25},
        system_prompt={"role": "developer", "content": "keep responses short"},
    )

    chunks = list(client.chat_stream("hello there"))
    assert chunks == ["stub-response"]

    captured = client.client.last_kwargs
    assert captured is not None
    messages = captured["messages"]

    assert messages[0] == {"role": "developer", "content": "keep responses short"}
    assert messages[-1] == {"role": "user", "content": "hello there"}
    assert captured["model"] == "openai/gpt-5"
    # Sanitized parameters keep temperature but omit system prompt.
    assert captured["temperature"] == 0.25


def test_chat_client_without_system_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    client = chat_model_client.OpenAIChatClient(
        api_key="token",
        model_name="gpt-4o-mini",
        model_parameters={"top_p": 0.8},
        system_prompt=None,
    )

    chunks = list(client.chat_stream("ping"))
    assert chunks == ["stub-response"]

    assert client.system_prompt_content is None
    captured = client.client.last_kwargs
    assert captured is not None
    assert "system_prompt" not in captured
    assert captured["top_p"] == 0.8
    messages = captured["messages"]
    assert messages[0] == {"role": "user", "content": "ping"}
