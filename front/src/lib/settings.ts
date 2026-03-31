const STORAGE_API = 'kamgu_api_base_url'
const STORAGE_MONTHLY_KEY = 'kamgu_monthly_internal_key'

function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function getApiBaseUrl(): string {
  try {
    const s = localStorage.getItem(STORAGE_API)
    if (s?.trim()) return trimBase(s)
  } catch {
    /* ignore */
  }
  const env = import.meta.env.VITE_API_BASE_URL
  return trimBase((env && env.trim()) || 'http://localhost:8080')
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
