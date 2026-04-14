import type {
  AuthStatusResponse,
  AuthTokenResponse,
  DigestRequest,
  DigestResponse,
  DigestSchedulesListResponse,
  MonthlyDigestRequest,
  MonthlyDigestResponse,
  PdfDocumentUploadResponse,
  PeriodicDigestScheduleCreate,
  PeriodicDigestScheduleOut,
  PeriodicDigestScheduleUpdate,
  TrendProfileLabelUpdate,
  TrendProfileSummary,
  TrendSeriesResponse,
} from '@/types/api'
import { getAccessToken, getMonthlyInternalKey } from '@/lib/settings'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseFastApiDetail(r: Response): Promise<string> {
  try {
    const j: unknown = await r.json()
    if (j && typeof j === 'object' && 'detail' in j) {
      const d = (j as { detail: unknown }).detail
      if (typeof d === 'string') return d
      if (Array.isArray(d)) {
        return d
          .map((item) => {
            if (item && typeof item === 'object' && 'msg' in item) {
              return String((item as { msg: string }).msg)
            }
            return JSON.stringify(item)
          })
          .join('; ')
      }
    }
    return JSON.stringify(j)
  } catch {
    return r.statusText || `HTTP ${r.status}`
  }
}

function mapFetchError(e: unknown): never {
  if (e instanceof DOMException && e.name === 'AbortError') {
    throw e
  }
  const msg =
    e instanceof TypeError
      ? 'Не удалось связаться с API (сеть, CORS или сервер недоступен).'
      : e instanceof Error
        ? e.message
        : String(e)
  throw new ApiError(msg, 0)
}

function bearerHeaders(options?: { accessToken?: string }): Record<string, string> {
  const token = (options?.accessToken ?? getAccessToken()).trim()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** X-Internal-Key: из options, из настроек или не добавлять (если передан явно ''). */
function cronKeyHeaders(options?: { internalKey?: string }): Record<string, string> {
  const keySrc = options?.internalKey !== undefined ? options.internalKey : getMonthlyInternalKey()
  const key = (keySrc ?? '').trim()
  return key ? { 'X-Internal-Key': key } : {}
}

function apiHeaders(
  base: Record<string, string>,
  options?: { accessToken?: string; internalKey?: string },
): Record<string, string> {
  return {
    ...base,
    ...bearerHeaders(options),
    ...cronKeyHeaders(options),
  }
}

/** Только Bearer (тренды, /auth/me и т.д.). */
function authOnlyHeaders(options?: { accessToken?: string }): Record<string, string> {
  return bearerHeaders(options)
}

export async function fetchAuthStatus(baseUrl: string, signal?: AbortSignal): Promise<AuthStatusResponse> {
  const r = await fetch(`${baseUrl}/auth/status`, { signal })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<AuthStatusResponse>
}

export async function authLogin(
  baseUrl: string,
  body: { username: string; password: string },
  signal?: AbortSignal,
): Promise<AuthTokenResponse> {
  const r = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<AuthTokenResponse>
}

export async function authRegister(
  baseUrl: string,
  body: { username: string; password: string },
  signal?: AbortSignal,
): Promise<AuthTokenResponse> {
  const r = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<AuthTokenResponse>
}

export async function fetchHealth(baseUrl: string): Promise<{ status: string }> {
  const r = await fetch(`${baseUrl}/health`)
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<{ status: string }>
}

export async function createDigest(
  baseUrl: string,
  body: DigestRequest,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<DigestResponse> {
  let r: Response
  try {
    r = await fetch(`${baseUrl}/digests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearerHeaders(options) },
      body: JSON.stringify(body),
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<DigestResponse>
}

export async function uploadPdfDocument(
  baseUrl: string,
  file: File,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<PdfDocumentUploadResponse> {
  const body = new FormData()
  body.append('file', file, file.name)
  let r: Response
  try {
    const headers = bearerHeaders(options)
    r = await fetch(`${baseUrl}/documents/pdf`, {
      method: 'POST',
      headers,
      body,
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<PdfDocumentUploadResponse>
}

export async function createMonthlyDigest(
  baseUrl: string,
  body: MonthlyDigestRequest,
  options?: { internalKey?: string; signal?: AbortSignal; accessToken?: string },
): Promise<MonthlyDigestResponse> {
  let r: Response
  try {
    r = await fetch(`${baseUrl}/digests/periodic`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }, options),
      body: JSON.stringify(body),
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<MonthlyDigestResponse>
}

export async function fetchDigestSchedules(
  baseUrl: string,
  options?: { internalKey?: string; signal?: AbortSignal; accessToken?: string },
): Promise<DigestSchedulesListResponse> {
  let r: Response
  try {
    r = await fetch(`${baseUrl}/digests/schedules`, {
      headers: apiHeaders({}, options),
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<DigestSchedulesListResponse>
}

export async function createDigestSchedule(
  baseUrl: string,
  body: PeriodicDigestScheduleCreate,
  options?: { internalKey?: string; signal?: AbortSignal; accessToken?: string },
): Promise<PeriodicDigestScheduleOut> {
  let r: Response
  try {
    r = await fetch(`${baseUrl}/digests/schedules`, {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }, options),
      body: JSON.stringify(body),
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<PeriodicDigestScheduleOut>
}

export async function patchDigestSchedule(
  baseUrl: string,
  scheduleId: string,
  body: PeriodicDigestScheduleUpdate,
  options?: { internalKey?: string; signal?: AbortSignal; accessToken?: string },
): Promise<PeriodicDigestScheduleOut> {
  const enc = encodeURIComponent(scheduleId)
  let r: Response
  try {
    r = await fetch(`${baseUrl}/digests/schedules/${enc}`, {
      method: 'PATCH',
      headers: apiHeaders({ 'Content-Type': 'application/json' }, options),
      body: JSON.stringify(body),
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<PeriodicDigestScheduleOut>
}

export async function deleteDigestSchedule(
  baseUrl: string,
  scheduleId: string,
  options?: { internalKey?: string; signal?: AbortSignal; accessToken?: string },
): Promise<void> {
  const enc = encodeURIComponent(scheduleId)
  let r: Response
  try {
    r = await fetch(`${baseUrl}/digests/schedules/${enc}`, {
      method: 'DELETE',
      headers: apiHeaders({}, options),
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
}

export async function fetchTrendProfiles(
  baseUrl: string,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<TrendProfileSummary[]> {
  const r = await fetch(`${baseUrl}/trends/profiles`, {
    signal: options?.signal,
    headers: authOnlyHeaders(options),
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<TrendProfileSummary[]>
}

export async function fetchTrendSeries(
  baseUrl: string,
  profileId: string,
  options?: {
    userId?: string
    signal?: AbortSignal
    accessToken?: string
  },
): Promise<TrendSeriesResponse> {
  const enc = encodeURIComponent(profileId)
  const q =
    options?.userId && options.userId.trim()
      ? `?user_id=${encodeURIComponent(options.userId.trim())}`
      : ''
  const r = await fetch(`${baseUrl}/trends/profiles/${enc}/series${q}`, {
    signal: options?.signal,
    headers: authOnlyHeaders(options),
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<TrendSeriesResponse>
}

export async function putTrendProfileLabel(
  baseUrl: string,
  profileId: string,
  body: TrendProfileLabelUpdate,
  options?: { internalKey?: string; signal?: AbortSignal; accessToken?: string },
): Promise<{ status: string; profile_id: string }> {
  const enc = encodeURIComponent(profileId)
  const r = await fetch(`${baseUrl}/trends/profiles/${enc}/label`, {
    method: 'PUT',
    headers: apiHeaders({ 'Content-Type': 'application/json' }, options),
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<{ status: string; profile_id: string }>
}
