from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "data" / "candidate_profile.yaml"
EXAMPLE_PATH = ROOT / "data" / "candidate_profile.example.yaml"
PREFERENCES_PATH = ROOT / "data" / "search_preferences.yaml"
PREFERENCES_EXAMPLE_PATH = ROOT / "data" / "search_preferences.example.yaml"

def load_profile() -> dict[str, Any]:
    path = PROFILE_PATH if PROFILE_PATH.exists() else EXAMPLE_PATH
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}

def load_preferences() -> dict[str, Any]:
    path = PREFERENCES_PATH if PREFERENCES_PATH.exists() else PREFERENCES_EXAMPLE_PATH
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}

def save_yaml(path: Path, value: dict[str, Any]) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(value, handle, sort_keys=False, allow_unicode=True)
    return value

def save_profile(value: dict[str, Any]) -> dict[str, Any]:
    return save_yaml(PROFILE_PATH, value)

def save_preferences(value: dict[str, Any]) -> dict[str, Any]:
    return save_yaml(PREFERENCES_PATH, value)
