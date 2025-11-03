from __future__ import annotations

from typing import Any, Dict

import pytest

from python_server.core import model_config


def test_resolve_model_config_uses_env_defaults_when_config_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(model_config, "load_json_file", lambda path: None)

    name, api_version, parameters, system_prompt = model_config.resolve_model_config(
        env_default_model="custom-model",
        env_default_api_version="2025-01-01-preview",
    )

    assert name == "custom-model"
    assert api_version == "2025-01-01-preview"
    assert parameters is None
    assert system_prompt is None


def test_resolve_model_config_reads_system_prompt_and_parameters(monkeypatch: pytest.MonkeyPatch) -> None:
    payload: Dict[str, Any] = {
        "model": {
            "name": "openai/test-model",
            "api_version": "2024-09-01-preview",
            "system_prompt": {"role": "developer", "content": "draft concise replies"},
            "parameters": {"temperature": 0.4, "top_p": 0.8},
        }
    }
    monkeypatch.setattr(model_config, "load_json_file", lambda path: payload)

    name, api_version, parameters, system_prompt = model_config.resolve_model_config()

    assert name == "openai/test-model"
    assert api_version == "2024-09-01-preview"
    assert parameters == {"temperature": 0.4, "top_p": 0.8}
    assert system_prompt == {"role": "developer", "content": "draft concise replies"}


def test_resolve_model_config_normalizes_string_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    payload: Dict[str, Any] = {
        "model": {
            "name": "gpt-inline",
            "api_version": "2024-06-01-preview",
            "system_prompt": "Please be brief.",
            "parameters": {},
        }
    }
    monkeypatch.setattr(model_config, "load_json_file", lambda path: payload)

    _, _, _, system_prompt = model_config.resolve_model_config()
    assert system_prompt == {"role": "system", "content": "Please be brief."}
