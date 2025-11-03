from __future__ import annotations

"""OpenAI chat model client abstraction.
"""
import logging
from typing import Iterator, Optional, List, Dict, Any, Tuple
import os
import inspect
from openai import OpenAI
from .model_config import resolve_model_config

_LOG = logging.getLogger(__name__ + ".token")


class OpenAIChatClient:
    def __init__(
        self,
        api_key: str,
        model_name: str,
        api_version: str = "2024-08-01-preview",
        base_url: str = "https://models.github.ai/inference",
        model_parameters: Optional[Dict[str, Any]] = None,
        system_prompt: Optional[Dict[str, str]] = None,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required for OpenAIChatClient (missing GitHub token)")
        self.logger = logging.getLogger(__name__ + ".OpenAIChatClient")
        self.api_key = api_key
        self.api_version = api_version
        self.model_name = model_name
        # Raw model parameters from config (may include a special 'system_prompt').
        self.model_parameters = dict(model_parameters) if isinstance(model_parameters, dict) else {}
        self.client = OpenAI(
            base_url=base_url,
            api_key=api_key,
            default_query={"api-version": api_version} if api_version else None,
        )

        # Introspect allowed parameter names once (avoid per-call overhead).
        try:
            sig = inspect.signature(self.client.chat.completions.create)
            self._allowed_param_keys = set(sig.parameters.keys())
        except Exception:  # pragma: no cover
            # Conservative fallback list if signature introspection fails.
            self._allowed_param_keys = {
                "model","messages","max_completion_tokens","temperature","top_p","presence_penalty","frequency_penalty",
                "stop","n","seed","logprobs","top_logprobs","response_format","stream","modalities","audio"
            }

        # Extract optional system prompt and build sanitized parameter dict (exclude unsupported keys).
        self.system_prompt_role, self.system_prompt_content = self._normalize_system_prompt(system_prompt)
        # Drop any stray legacy keys to avoid sending unsupported params.
        self.model_parameters.pop("system_prompt", None)

        self.sanitized_parameters: Dict[str, Any] = {}
        for k, v in self.model_parameters.items():
            if k in self._allowed_param_keys:
                self.sanitized_parameters[k] = v

    @staticmethod
    def _normalize_system_prompt(
        raw_prompt: Optional[Dict[str, Any] | str],
    ) -> Tuple[str, Optional[str]]:
        """Normalize provided system prompt into (role, content)."""
        if isinstance(raw_prompt, dict):
            raw_content = raw_prompt.get("content")
            if isinstance(raw_content, str) and raw_content.strip():
                raw_role = raw_prompt.get("role")
                role = raw_role.strip() if isinstance(raw_role, str) and raw_role.strip() else "system"
                return role, raw_content.strip()
            return "system", None
        if isinstance(raw_prompt, str) and raw_prompt.strip():
            return "system", raw_prompt.strip()
        return "system", None

    def chat_stream(
        self,
        text_input: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
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

        # Prepend system prompt if configured.
        if self.system_prompt_content:
            messages.insert(0, {"role": self.system_prompt_role, "content": self.system_prompt_content})

        messages.append({"role": "user", "content": text_input})
        try:
            # Build request kwargs, passing only configured parameters if present.
            req_kwargs: Dict[str, Any] = {
                "messages": messages,  # type: ignore[arg-type]
                "model": self.model_name,
                "stream": True,
            }
            if self.sanitized_parameters:
                req_kwargs.update(self.sanitized_parameters)

            response = self.client.chat.completions.create(**req_kwargs)
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
        api_key = os.environ.get("GITHUB_TOKEN")
        if not api_key:
            # Prefer explicit failure so callers surface clear 500 and logs
            _LOG.error("Missing GITHUB_TOKEN: set githubModelsToken (Bicep param), app setting, or Key Vault reference.")
            raise ValueError("GITHUB_TOKEN environment variable is required for AI model access")
        model_name, api_version, model_parameters, system_prompt = resolve_model_config(
            env_default_model=os.environ.get("MODEL_NAME", "gpt-4o-mini"),
            env_default_api_version=os.environ.get("API_VERSION", "2024-08-01-preview"),
        )
        _client_singleton = OpenAIChatClient(
            api_key=api_key,
            model_name=model_name,
            api_version=api_version,
            model_parameters=model_parameters,
            system_prompt=system_prompt,
        )
    return _client_singleton


def chat_stream(text_input: str, **kwargs: Any) -> Iterator[str]:
    client = get_openai_chat_client()
    yield from client.chat_stream(text_input, **kwargs)


def chat(text_input: str, **kwargs: Any) -> str:
    return "".join(chat_stream(text_input, **kwargs))
