import json
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


def _build_context(
    *,
    model_name: str,
    api_version: str,
    system_prompt: Optional[str],
    parameters: Dict[str, Any] | None = None,
    response_format: Optional[Dict[str, Any]] = None,
    o1: bool = False,
) -> Dict[str, Any]:
    params = dict(parameters or {})
    param_dict: Dict[str, Any] = {}

    max_tokens = params.pop("max_tokens", None)
    if max_tokens is not None:
        key = "max_completion_tokens" if o1 else "max_tokens"
        param_dict[key] = max_tokens

    if response_format is not None:
        param_dict["response_format"] = response_format

    params.pop("response_format", None)
    for key, value in params.items():
        param_dict[key] = value

    context: Dict[str, Any] = {
        "model_name": model_name,
        "api_version": api_version,
        "parameters_json": json.dumps(param_dict),
    }

    if system_prompt is not None:
        context["systemWithQuote"] = json.dumps(system_prompt)
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

    payload = json.loads(_render(context))

    system_prompt = json.loads(context["systemWithQuote"])
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
    payload = json.loads(_render(_build_context(
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

    payload = json.loads(_render(context))
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

    payload = json.loads(_render(context))
    params = payload["model"]["parameters"]
    assert params == {"temperature": 0.0}
    assert "response_format" not in params
    assert "max_tokens" not in params


def test_template_preserves_special_characters_in_system_prompt():
    prompt = 'Follow the user\'s lead.\nRespond with "yes" or "no".'
    context = _build_context(
        model_name="gpt-specialist",
        api_version="2024-08-01-preview",
        system_prompt=prompt,
    )

    payload = json.loads(_render(context))
    assert payload["model"]["system_prompt"]["content"] == prompt


def test_template_omits_system_prompt_when_not_provided():
    context = _build_context(
        model_name="gpt-no-system",
        api_version="2024-08-01-preview",
        system_prompt=None,
        parameters={"temperature": 0.6},
    )

    payload = json.loads(_render(context))
    assert "system_prompt" not in payload["model"]
    assert payload["model"]["parameters"] == {"temperature": 0.6}
