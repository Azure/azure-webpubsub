import json
import re
from pathlib import Path
from typing import Any, Dict, Optional

import chevron


TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "python_server" / "config.json.tpl"


def _render(context: Dict[str, Any]) -> str:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    try:
        return chevron.render(template, context, keep=True)
    except TypeError:
        return chevron.render(template, context)


def _loads_relaxed(raw: str) -> Dict[str, Any]:
    """Decode template output while tolerating dangling commas."""
    cleaned = re.sub(r",(\s*[}\]])", r"\1", raw)
    return json.loads(cleaned)


def _build_context(
    *,
    model_name: str,
    api_version: str,
    system_prompt: str,
    parameters: Dict[str, Any] | None = None,
    response_format: Optional[Dict[str, Any]] = None,
    o1: bool = False,
) -> Dict[str, Any]:
    context: Dict[str, Any] = {
        "model_name": model_name,
        "api_version": api_version,
        "parameters": {
            "systemWithQuote": json.dumps(system_prompt),
        },
    }
    params = parameters or {}
    for key in (
        "max_tokens",
        "temperature",
        "top_p",
        "frequency_penalty",
        "presence_penalty",
        "reasoning_effort",
        "verbosity",
    ):
        if key in params:
            context["parameters"][key] = params[key]
    if response_format is not None:
        context["response_format"] = json.dumps(response_format)
    if o1:
        context["o1"] = True
    return context


def test_template_renders_o1_parameters_block():
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "moderated_chat",
            "schema": {
                "type": "object",
                "properties": {
                    "classification": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["classification", "content"],
            },
        },
    }
    context = _build_context(
        model_name="openai/gpt-4.1",
        api_version="2024-08-01-preview",
        system_prompt="Summarize user messages succinctly.",
        parameters={
            "max_tokens": 800,
            "temperature": 0.1,
            "top_p": 0.9,
            "frequency_penalty": 0.5,
            "presence_penalty": 0.1,
            "reasoning_effort": "medium",
            "verbosity": "concise",
        },
        response_format=response_format,
        o1=True,
    )

    payload = _loads_relaxed(_render(context))

    system_prompt = json.loads(context["parameters"]["systemWithQuote"])
    assert payload["model"]["system_prompt"] == {
        "role": "developer",
        "content": system_prompt,
    }
    assert payload["model"]["parameters"] == {
        "response_format": response_format,
        "max_completion_tokens": 800,
        "temperature": 0.1,
        "top_p": 0.9,
        "frequency_penalty": 0.5,
        "presence_penalty": 0.1,
        "reasoning_effort": "medium",
        "verbosity": "concise",
    }


def test_template_handles_minimal_parameters():
    payload = _loads_relaxed(_render(_build_context(
        model_name="orca-mini",
        api_version="2024-08-01-preview",
        system_prompt="Stay helpful.",
    )))

    assert payload == {
        "model": {
            "name": "orca-mini",
            "api_version": "2024-08-01-preview",
            "system_prompt": {
                "role": "system",
                "content": "Stay helpful.",
            },
            "parameters": {},
        }
    }


def test_template_renders_standard_parameters_without_o1():
    context = _build_context(
        model_name="gpt-4o-mini",
        api_version="2024-08-01-preview",
        system_prompt="Assist with code reviews.",
        parameters={
            "max_tokens": 1024,
            "temperature": 0.2,
            "top_p": 0.85,
            "presence_penalty": 0.3,
        },
    )

    payload = _loads_relaxed(_render(context))
    assert payload["model"]["system_prompt"] == {
        "role": "system",
        "content": "Assist with code reviews.",
    }
    assert payload["model"]["parameters"] == {
        "max_tokens": 1024,
        "temperature": 0.2,
        "top_p": 0.85,
        "presence_penalty": 0.3,
    }


def test_template_drops_absent_optional_fields():
    context = _build_context(
        model_name="gpt-lite",
        api_version="2024-08-01-preview",
        system_prompt="Say hello.",
        parameters={
            "temperature": 0.0,
        },
    )

    payload = _loads_relaxed(_render(context))
    params = payload["model"]["parameters"]
    assert params == {}
    assert "response_format" not in params
    assert "max_tokens" not in params


def test_template_preserves_special_characters_in_system_prompt():
    prompt = 'Follow the user\'s lead.\nRespond with "yes" or "no".'
    context = _build_context(
        model_name="gpt-specialist",
        api_version="2024-08-01-preview",
        system_prompt=prompt,
    )

    payload = _loads_relaxed(_render(context))
    assert payload["model"]["system_prompt"]["content"] == prompt
