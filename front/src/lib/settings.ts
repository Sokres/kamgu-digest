const STORAGE_API = 'kamgu_api_base_url'
const STORAGE_MONTHLY_KEY = 'kamgu_monthly_internal_key'
const STORAGE_AUTH_TOKEN = 'kamgu_access_token'
const STORAGE_THEME = 'kamgu_theme'

export type ThemePreference = 'light' | 'dark' | 'system'

function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/**
 * URL API по умолчанию, если в localStorage ничего не сохранено:
 * - VITE_API_BASE_URL из сборки (если задан);
 * - в dev (Vite) — обычно бэкенд на :8080;
 * - в production — тот же origin, что и у страницы (типичный деплой: nginx отдаёт SPA и проксирует API на тот же хост).
 */
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

/** Apply `.dark` on `document.documentElement` from saved preference. */
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
