"""Переопределение LLM с запроса (BYOK): заголовки → contextvars → pipeline.llm."""

from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass

from digest.config import settings


@dataclass(frozen=True)
class LLMRequestOverride:
    api_key: str
    base_url: str | None
    model: str | None
    json_mode: bool | None


@dataclass(frozen=True)
class EffectiveLLMRuntime:
    api_key: str
    base_url: str | None
    model: str
    json_format: bool
    key_source_label: str


_llm_override: ContextVar[LLMRequestOverride | None] = ContextVar("kamgu_llm_override", default=None)


def push_llm_override(ov: LLMRequestOverride) -> Token:
    return _llm_override.set(ov)


def reset_llm_override(token: Token) -> None:
    _llm_override.reset(token)


def _infer_base_for_single_user_key(key: str) -> str | None:
    k = key.strip()
    if k.startswith("sk-or-v1-"):
        return "https://openrouter.ai/api/v1"
    return None


def effective_llm_api_key() -> str:
    o = _llm_override.get()
    if o is not None and o.api_key.strip():
        return o.api_key.strip()
    return (settings.llm_api_key_resolved() or "").strip()


def resolve_effective_llm_runtime() -> EffectiveLLMRuntime:
    o = _llm_override.get()
    if o is not None and o.api_key.strip():
        key = o.api_key.strip()
        raw_base = (o.base_url or "").strip()
        if raw_base:
            base = raw_base.rstrip("/")
        else:
            inferred = _infer_base_for_single_user_key(key)
            base = inferred.rstrip("/") if inferred else None
        model = (o.model or "").strip() or settings.openai_model
        jf = settings.openai_response_format_json if o.json_mode is None else o.json_mode
        return EffectiveLLMRuntime(
            api_key=key,
            base_url=base,
            model=model,
            json_format=jf,
            key_source_label="client_headers",
        )

    key = (settings.llm_api_key_resolved() or "").strip()
    base_url = (settings.openai_base_url or "").strip()
    if not base_url and (settings.openrouter_api_key or "").strip():
        base_url = "https://openrouter.ai/api/v1"
    final_base = base_url.rstrip("/") if base_url else None
    return EffectiveLLMRuntime(
        api_key=key,
        base_url=final_base,
        model=settings.openai_model,
        json_format=settings.openai_response_format_json,
        key_source_label=settings.llm_api_key_source_label(),
    )
