const STORAGE_API = 'kamgu_api_base_url'
const STORAGE_MONTHLY_KEY = 'kamgu_monthly_internal_key'
const STORAGE_AUTH_TOKEN = 'kamgu_access_token'
const STORAGE_REFRESH_TOKEN = 'kamgu_refresh_token'
const STORAGE_THEME = 'kamgu_theme'
const STORAGE_LLM_KEY = 'kamgu_llm_api_key'
const STORAGE_LLM_BASE = 'kamgu_llm_base_url'
const STORAGE_LLM_MODEL = 'kamgu_llm_model'
const STORAGE_LLM_JSON = 'kamgu_llm_json_mode'
const STORAGE_LLM_PRESET = 'kamgu_llm_preset_id'

export type ThemePreference = 'light' | 'dark' | 'system'

export type LlmPresetId =
  | 'server'
  | 'openrouter'
  | 'openai'
  | 'deepseek'
  | 'groq_llama'
  | 'groq_llama31_8b'
  | 'groq_gpt_oss_120b'
  | 'groq_gpt_oss_20b'
  | 'groq_qwen3_32b'
  | 'mistral_small'
  | 'together_llama'
  | 'xai_grok'
  | 'ollama_local'
  | 'gemini_google_flash'
  | 'or_free_router'
  | 'or_llama33_70b_free'
  | 'or_gpt_oss_120b_free'
  | 'or_gpt_oss_20b_free'
  | 'or_gemma_4_31b_free'
  | 'or_qwen3_next_free'
  | 'or_nemotron_super_free'
  | 'or_qwen'
  | 'or_deepseek'
  | 'or_gpt4o'
  | 'or_gemini_flash'
  | 'or_claude_sonnet'
  | 'or_llama33_70b'
  | 'custom'

export type LlmPresetPricing = 'free_local' | 'free_quota' | 'paid' | 'depends'

export const LLM_PRESET_PRICING_LABEL: Record<LlmPresetPricing, string> = {
  free_local: 'Бесплатно',
  free_quota: 'Бесплатный тариф',
  paid: 'Платно',
  depends: 'По настройке',
}

export type LlmPresetOption = {
  id: LlmPresetId
  label: string
  baseUrl: string
  model: string
  pricing: LlmPresetPricing
  description?: string
}

export const LLM_PRESET_OPTIONS: LlmPresetOption[] = [
  {
    id: 'server',
    label: 'Как на сервере',
    baseUrl: '',
    model: '',
    pricing: 'depends',
    description: 'Ключ и модель берутся из настройки API на стороне сервиса, не из этого браузера.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter — openai/gpt-4o-mini',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    pricing: 'paid',
  },
  {
    id: 'openai',
    label: 'OpenAI — gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    pricing: 'paid',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek — deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    pricing: 'free_quota',
    description: 'Ключ на platform.deepseek.com; новым аккаунтам — бесплатные токены, дальше pay-as-you-go.',
  },
  {
    id: 'groq_llama',
    label: 'Groq — Llama 3.3 70B',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    pricing: 'free_quota',
    description: 'Низкая задержка; проверьте лимиты тарифа.',
  },
  {
    id: 'groq_llama31_8b',
    label: 'Groq — Llama 3.1 8B Instant',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
    pricing: 'free_quota',
    description: 'Быстрая компактная модель на Groq.',
  },
  {
    id: 'groq_gpt_oss_120b',
    label: 'Groq — OpenAI GPT-OSS 120B',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    pricing: 'free_quota',
    description: 'Открытая модель OpenAI на инференсе Groq; проверьте JSON-режим при ошибках.',
  },
  {
    id: 'groq_gpt_oss_20b',
    label: 'Groq — OpenAI GPT-OSS 20B',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-20b',
    pricing: 'free_quota',
    description: 'Легче 120B; подходит для черновиков и быстрых ответов.',
  },
  {
    id: 'groq_qwen3_32b',
    label: 'Groq — Qwen3 32B',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'qwen/qwen3-32b',
    pricing: 'free_quota',
    description: 'Модель в режиме предпросмотра; действуют ограничения доступности.',
  },
  {
    id: 'mistral_small',
    label: 'Mistral — mistral-small-latest',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    pricing: 'paid',
  },
  {
    id: 'together_llama',
    label: 'Together — Llama 3.3 70B Instruct',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    pricing: 'paid',
  },
  {
    id: 'xai_grok',
    label: 'xAI — grok-2-latest',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2-latest',
    pricing: 'paid',
    description: 'OpenAI-совместимый endpoint на домене провайдера.',
  },
  {
    id: 'ollama_local',
    label: 'Ollama (локально) — llama3.2',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
    pricing: 'free_local',
    description: 'Локальный вывод; при необходимости укажите другой базовый адрес.',
  },
  {
    id: 'gemini_google_flash',
    label: 'Google — Gemini 2.0 Flash (совместимый формат)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.0-flash',
    pricing: 'free_quota',
    description:
      'Укажите свой ключ провайдера и учитывайте квоты; при ошибках JSON попробуйте выключить JSON-режим.',
  },
  {
    id: 'or_free_router',
    label: 'OpenRouter — роутер бесплатных моделей (openrouter/free)',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    pricing: 'free_quota',
    description:
      'OpenRouter сам подбирает доступную бесплатную модель в рамках вашего ключа и лимитов провайдера.',
  },
  {
    id: 'or_llama33_70b_free',
    label: 'OpenRouter FREE — Llama 3.3 70B Instruct',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    pricing: 'free_quota',
    description: 'Вариант :free на OpenRouter (лимиты RPM/RPD). При ошибке JSON отключите JSON-режим.',
  },
  {
    id: 'or_gpt_oss_120b_free',
    label: 'OpenRouter FREE — OpenAI GPT-OSS 120B',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-oss-120b:free',
    pricing: 'free_quota',
    description: 'Открытая модель OpenAI, бесплатный слой на OpenRouter.',
  },
  {
    id: 'or_gpt_oss_20b_free',
    label: 'OpenRouter FREE — OpenAI GPT-OSS 20B',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-oss-20b:free',
    pricing: 'free_quota',
    description: 'Легче, чем 120B; разумный выбор под лимиты.',
  },
  {
    id: 'or_gemma_4_31b_free',
    label: 'OpenRouter FREE — Google Gemma 4 31B IT',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemma-4-31b-it:free',
    pricing: 'free_quota',
    description: 'Google Gemma на бесплатном тарифе OpenRouter.',
  },
  {
    id: 'or_qwen3_next_free',
    label: 'OpenRouter FREE — Qwen3 Next 80B A3B',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen3-next-80b-a3b-instruct:free',
    pricing: 'free_quota',
    description: 'Сильная открытая модель Qwen в линейке :free.',
  },
  {
    id: 'or_nemotron_super_free',
    label: 'OpenRouter FREE — NVIDIA Nemotron 3 Super 120B',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    pricing: 'free_quota',
    description: 'Крупная MoE-модель NVIDIA на бесплатном слое OpenRouter.',
  },
  {
    id: 'or_qwen',
    label: 'OpenRouter — Qwen 2.5 72B',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen-2.5-72b-instruct',
    pricing: 'paid',
  },
  {
    id: 'or_deepseek',
    label: 'OpenRouter — DeepSeek Chat',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-chat',
    pricing: 'paid',
  },
  {
    id: 'or_gpt4o',
    label: 'OpenRouter — openai/gpt-4o',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o',
    pricing: 'paid',
  },
  {
    id: 'or_gemini_flash',
    label: 'OpenRouter — Gemini 2.0 Flash',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.0-flash-001',
    pricing: 'paid',
  },
  {
    id: 'or_claude_sonnet',
    label: 'OpenRouter — Claude 3.5 Sonnet',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
    pricing: 'paid',
  },
  {
    id: 'or_llama33_70b',
    label: 'OpenRouter — Meta Llama 3.3 70B',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct',
    pricing: 'paid',
  },
  {
    id: 'custom',
    label: 'Свой endpoint и модель',
    baseUrl: '',
    model: '',
    pricing: 'depends',
    description: 'Base URL и имя модели вручную (API в стиле OpenAI chat/completions).',
  },
]

export const LLM_PRESET_PRICING_LEGEND =
  'Бесплатно — без оплаты к модели (локально на вашей стороне). Бесплатный тариф — типичные квоты без списания по вашей карте зависят от провайдера. Платно — по условиям тарифа при наличии баланса или подписки. У части моделей есть суффикс :free на OpenRouter; произвольный идентификатор можно задать в своём пресете.'

function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function getDefaultApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL
  if (env && String(env).trim()) return trimBase(String(env))
  if (import.meta.env.DEV) return 'http://localhost:8080'
  if (typeof window !== 'undefined' && window.location?.origin) {
    return trimBase(window.location.origin)
  }
  return 'http://localhost:8080'
}

export function getApiBaseUrl(): string {
  try {
    const s = localStorage.getItem(STORAGE_API)
    if (s?.trim()) return trimBase(s)
  } catch {
    /* ignore */
  }
  return getDefaultApiBaseUrl()
}

export function setApiBaseUrl(url: string): void {
  localStorage.setItem(STORAGE_API, trimBase(url))
}

export function getMonthlyInternalKey(): string {
  try {
    const s = localStorage.getItem(STORAGE_MONTHLY_KEY)
    if (s !== null) return s
  } catch {
    /* ignore */
  }
  return import.meta.env.VITE_MONTHLY_INTERNAL_KEY || ''
}

export function setMonthlyInternalKey(key: string): void {
  localStorage.setItem(STORAGE_MONTHLY_KEY, key)
}

export function getAccessToken(): string {
  try {
    const s = localStorage.getItem(STORAGE_AUTH_TOKEN)
    if (s !== null) return s
  } catch {
    /* ignore */
  }
  return ''
}

export function setAccessToken(token: string): void {
  localStorage.setItem(STORAGE_AUTH_TOKEN, token.trim())
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(STORAGE_AUTH_TOKEN)
  } catch {
    /* ignore */
  }
}

export function getRefreshToken(): string {
  try {
    const s = localStorage.getItem(STORAGE_REFRESH_TOKEN)
    if (s !== null) return s
  } catch {
    /* ignore */
  }
  return ''
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(STORAGE_REFRESH_TOKEN, token.trim())
}

export function clearRefreshToken(): void {
  try {
    localStorage.removeItem(STORAGE_REFRESH_TOKEN)
  } catch {
    /* ignore */
  }
}

export function getThemePreference(): ThemePreference {
  try {
    const s = localStorage.getItem(STORAGE_THEME)
    if (s === 'light' || s === 'dark' || s === 'system') return s
  } catch {
    /* ignore */
  }
  return 'system'
}

export function setThemePreference(pref: ThemePreference): void {
  localStorage.setItem(STORAGE_THEME, pref)
}

export function applyThemeFromPreference(): void {
  const pref = getThemePreference()
  const root = document.documentElement
  if (pref === 'dark') {
    root.classList.add('dark')
    return
  }
  if (pref === 'light') {
    root.classList.remove('dark')
    return
  }
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  if (prefersDark) root.classList.add('dark')
  else root.classList.remove('dark')
}

export function getLlmPresetId(): LlmPresetId {
  try {
    const s = localStorage.getItem(STORAGE_LLM_PRESET)
    if (s && LLM_PRESET_OPTIONS.some((o) => o.id === s)) return s as LlmPresetId
  } catch {
    /* ignore */
  }
  return 'server'
}

export function setLlmPresetId(id: LlmPresetId): void {
  try {
    localStorage.setItem(STORAGE_LLM_PRESET, id)
  } catch {
    /* ignore */
  }
}

export function getLlmClientApiKey(): string {
  try {
    const s = localStorage.getItem(STORAGE_LLM_KEY)
    if (s !== null) return s
  } catch {
    /* ignore */
  }
  return ''
}

export function setLlmClientApiKey(key: string): void {
  localStorage.setItem(STORAGE_LLM_KEY, key)
}

export function getLlmClientBaseUrl(): string {
  try {
    const s = localStorage.getItem(STORAGE_LLM_BASE)
    if (s !== null) return s
  } catch {
    /* ignore */
  }
  return ''
}

export function setLlmClientBaseUrl(url: string): void {
  localStorage.setItem(STORAGE_LLM_BASE, url.trim())
}

export function getLlmClientModel(): string {
  try {
    const s = localStorage.getItem(STORAGE_LLM_MODEL)
    if (s !== null) return s
  } catch {
    /* ignore */
  }
  return ''
}

export function setLlmClientModel(model: string): void {
  localStorage.setItem(STORAGE_LLM_MODEL, model.trim())
}

export function getLlmClientJsonMode(): boolean {
  try {
    const s = localStorage.getItem(STORAGE_LLM_JSON)
    if (s === '0' || s === 'false') return false
    if (s === '1' || s === 'true') return true
  } catch {
    /* ignore */
  }
  return true
}

export function setLlmClientJsonMode(v: boolean): void {
  localStorage.setItem(STORAGE_LLM_JSON, v ? '1' : '0')
}

export function buildLlmClientHeaders(): Record<string, string> {
  const key = getLlmClientApiKey().trim()
  if (!key) return {}
  const h: Record<string, string> = { 'X-Kamgu-Llm-Key': key }
  const base = getLlmClientBaseUrl().trim()
  if (base) h['X-Kamgu-Llm-Base-Url'] = base
  const model = getLlmClientModel().trim()
  if (model) h['X-Kamgu-Llm-Model'] = model
  h['X-Kamgu-Llm-Json-Mode'] = getLlmClientJsonMode() ? 'true' : 'false'
  return h
}

export function clearLlmClientOverride(): void {
  try {
    localStorage.removeItem(STORAGE_LLM_KEY)
    localStorage.removeItem(STORAGE_LLM_BASE)
    localStorage.removeItem(STORAGE_LLM_MODEL)
    localStorage.removeItem(STORAGE_LLM_JSON)
    localStorage.setItem(STORAGE_LLM_PRESET, 'server')
  } catch {
    /* ignore */
  }
}
