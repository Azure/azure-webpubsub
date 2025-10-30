from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Tuple, Optional


def load_json_file(path: str | os.PathLike[str]) -> Any | None:
    """Load JSON from a file path and return the parsed object.

    Returns None if file does not exist or on parse/read errors.
    """
    try:
        p = Path(path)
        if not p.exists():
            return None
        with p.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def resolve_model_config(
    env_default_model: Optional[str] = None,
    env_default_api_version: Optional[str] = None,
) -> Tuple[str, str, Optional[Dict[str, Any]]]:
    """Resolve model name and parameters from config.json with env fallback.

    - Starts with model name from `env_default_model` or "gpt-4o-mini".
    - If `python_server/config.json` exists and contains `model.model`, it overrides the name.
    - If `model.parameters` is a dict, returns it; otherwise returns None.
    """
    model_name = env_default_model or "gpt-4o-mini"
    api_version = env_default_api_version or "2024-08-01-preview"
    model_parameters: Dict[str, Any] | None = None

    # Compute path: current file is .../python_server/core/model_config.py
    # Config file resides at .../python_server/config.json
    here = Path(__file__).resolve()
    cfg_path = here.parent.parent / "config.json"

    cfg = load_json_file(cfg_path)
    if isinstance(cfg, dict):
        model_cfg = cfg.get("model")
        if isinstance(model_cfg, dict):
            # Prefer new key "name"; fall back to legacy "model" if present
            raw_name = model_cfg.get("name")
            if not isinstance(raw_name, str) or not raw_name.strip():
                raw_name = model_cfg.get("model")
            if isinstance(raw_name, str) and raw_name.strip():
                model_name = raw_name.strip()
            # API version may be provided as "api_version" in config
            raw_api_version = model_cfg.get("api_version")
            if isinstance(raw_api_version, str) and raw_api_version.strip():
                api_version = raw_api_version.strip()
            params = model_cfg.get("parameters")
            if isinstance(params, dict):
                model_parameters = params

    return model_name, api_version, model_parameters


__all__ = [
    "load_json_file",
    "resolve_model_config",
]
