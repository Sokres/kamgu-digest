"""Контекст BYOK для LLM."""

from digest.config import settings
from digest.llm_override import (
    LLMRequestOverride,
    effective_llm_api_key,
    push_llm_override,
    reset_llm_override,
    resolve_effective_llm_runtime,
)


def test_effective_key_with_override():
    o = LLMRequestOverride(
        api_key="sk-or-v1-test",
        base_url="https://openrouter.ai/api/v1",
        model="openai/gpt-4o-mini",
        json_mode=True,
    )
    t = push_llm_override(o)
    try:
        assert effective_llm_api_key() == "sk-or-v1-test"
        rt = resolve_effective_llm_runtime()
        assert rt.key_source_label == "client_headers"
        assert rt.model == "openai/gpt-4o-mini"
        assert rt.json_format is True
        assert rt.base_url == "https://openrouter.ai/api/v1"
    finally:
        reset_llm_override(t)


def test_infer_openrouter_base_when_base_missing():
    o = LLMRequestOverride(api_key="sk-or-v1-abc", base_url=None, model="x/y", json_mode=False)
    t = push_llm_override(o)
    try:
        rt = resolve_effective_llm_runtime()
        assert rt.base_url == "https://openrouter.ai/api/v1"
        assert rt.model == "x/y"
        assert rt.json_format is False
    finally:
        reset_llm_override(t)


def test_override_model_defaults_to_server_setting():
    o = LLMRequestOverride(api_key="sk-secret", base_url="https://api.example.com/v1", model=None, json_mode=None)
    t = push_llm_override(o)
    try:
        rt = resolve_effective_llm_runtime()
        assert rt.model == settings.openai_model
        assert rt.json_format == settings.openai_response_format_json
    finally:
        reset_llm_override(t)
