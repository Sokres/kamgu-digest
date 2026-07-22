import type {
  AuthMeResponse,
  AuthStatusResponse,
  AuthTokenResponse,
  DigestProfileCreated,
  DigestProfileCreateBody,
  DigestRequest,
  DigestResponse,
  DigestScheduleRunOut,
  DigestSchedulesListResponse,
  MonthlyDigestRequest,
  MonthlyDigestResponse,
  PdfDocumentUploadResponse,
  PeriodicDigestScheduleCreate,
  PeriodicDigestScheduleOut,
  PeriodicDigestScheduleUpdate,
  SavedDigestCreateBody,
  SavedDigestCreated,
  SavedDigestListItem,
  SavedDigestOut,
  SavedDigestShareResponse,
  TrendAnalysisResponse,
  TrendHighlightsResponse,
  TrendProfileLabelUpdate,
  TrendProfileSummary,
  TrendSnapshotDetail,
  TrendSeriesResponse,
} from '@/types/api'
import { getAccessToken, getMonthlyInternalKey, buildLlmClientHeaders, getRefreshToken, setAccessToken, setRefreshToken, clearAccessToken, clearRefreshToken } from '@/lib/settings'

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

let refreshInFlight: Promise<boolean> | null = null

async function authRefreshRaw(baseUrl: string, refreshToken: string, signal?: AbortSignal): Promise<AuthTokenResponse> {
  const r = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal,
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<AuthTokenResponse>
}

export async function authRefresh(
  baseUrl: string,
  refreshToken: string,
  signal?: AbortSignal,
): Promise<AuthTokenResponse> {
  return authRefreshRaw(baseUrl, refreshToken, signal)
}

async function runRefreshSession(baseUrl: string): Promise<boolean> {
  const rt = getRefreshToken().trim()
  if (!rt) return false
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const data = await authRefreshRaw(baseUrl, rt)
        setAccessToken(data.access_token)
        setRefreshToken(data.refresh_token)
        return true
      } catch {
        clearAccessToken()
        clearRefreshToken()
        return false
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

async function fetchWithAuthRetry(baseUrl: string, exec: () => Promise<Response>): Promise<Response> {
  const r = await exec()
  if (r.status !== 401 || !getRefreshToken().trim()) {
    return r
  }
  const ok = await runRefreshSession(baseUrl)
  if (!ok) {
    return r
  }
  return exec()
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

function authOnlyHeaders(options?: { accessToken?: string }): Record<string, string> {
  return bearerHeaders(options)
}

export async function fetchAuthStatus(baseUrl: string, signal?: AbortSignal): Promise<AuthStatusResponse> {
  const r = await fetch(`${baseUrl}/auth/status`, { signal })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<AuthStatusResponse>
}

export async function fetchAuthMe(
  baseUrl: string,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<AuthMeResponse> {
  const r = await fetch(`${baseUrl}/auth/me`, {
    signal: options?.signal,
    headers: { ...authOnlyHeaders(options) },
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<AuthMeResponse>
}

export async function authLogout(
  baseUrl: string,
  options?: { refreshToken?: string | null; signal?: AbortSignal; accessToken?: string },
): Promise<void> {
  const payload =
    options?.refreshToken && options.refreshToken.trim()
      ? { refresh_token: options.refreshToken.trim() }
      : {}
  let r: Response
  try {
    r = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authOnlyHeaders(options) },
      body: JSON.stringify(payload),
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok && r.status !== 401) {
    throw new ApiError(await parseFastApiDetail(r), r.status)
  }
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

export async function authChangePassword(
  baseUrl: string,
  body: { current_password: string; new_password: string },
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<void> {
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authOnlyHeaders(options) },
        body: JSON.stringify(body),
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
}

export async function fetchHealth(baseUrl: string): Promise<{ status: string }> {
  const r = await fetch(`${baseUrl}/health`)
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<{ status: string }>
}

export async function listSavedDigests(
  baseUrl: string,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<SavedDigestListItem[]> {
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/saved-digests`, {
        headers: { ...authOnlyHeaders(options) },
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<SavedDigestListItem[]>
}

export async function getSavedDigest(
  baseUrl: string,
  id: string,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<SavedDigestOut> {
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/saved-digests/${encodeURIComponent(id)}`, {
        headers: { ...authOnlyHeaders(options) },
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<SavedDigestOut>
}

function filenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"(.*)"$/, '$1'))
    } catch {
      return star[1].trim()
    }
  }
  const q = /filename="([^"]+)"/i.exec(cd)
  if (q?.[1]) return q[1]
  return null
}

export async function downloadSavedDigestDocx(
  baseUrl: string,
  id: string,
  options?: { accessToken?: string },
): Promise<void> {
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/saved-digests/${encodeURIComponent(id)}/export/docx`, {
        headers: { ...authOnlyHeaders(options) },
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  const blob = await r.blob()
  const name = filenameFromContentDisposition(r.headers.get('Content-Disposition')) ?? `digest-${id}.docx`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function saveDigest(
  baseUrl: string,
  body: SavedDigestCreateBody,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<SavedDigestCreated> {
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/saved-digests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authOnlyHeaders(options) },
        body: JSON.stringify(body),
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<SavedDigestCreated>
}

export async function deleteSavedDigest(
  baseUrl: string,
  id: string,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<void> {
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/saved-digests/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { ...authOnlyHeaders(options) },
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
}

export async function fetchPublicSavedDigest(
  baseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<SavedDigestOut> {
  const enc = encodeURIComponent(token)
  let r: Response
  try {
    r = await fetch(`${baseUrl}/public/saved-digests/${enc}`, { signal })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<SavedDigestOut>
}

export async function createSavedDigestShare(
  baseUrl: string,
  digestId: string,
  options?: { rotate?: boolean; signal?: AbortSignal; accessToken?: string },
): Promise<SavedDigestShareResponse> {
  const enc = encodeURIComponent(digestId)
  const q = options?.rotate ? '?rotate=true' : ''
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/saved-digests/${enc}/share${q}`, {
        method: 'POST',
        headers: authOnlyHeaders(options),
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<SavedDigestShareResponse>
}

export async function deleteSavedDigestShare(
  baseUrl: string,
  digestId: string,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<void> {
  const enc = encodeURIComponent(digestId)
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/saved-digests/${enc}/share`, {
        method: 'DELETE',
        headers: authOnlyHeaders(options),
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
}

export async function fetchScheduleRuns(
  baseUrl: string,
  scheduleId: string,
  options?: {
    limit?: number
    internalKey?: string
    signal?: AbortSignal
    accessToken?: string
  },
): Promise<DigestScheduleRunOut[]> {
  const enc = encodeURIComponent(scheduleId)
  const lim = options?.limit != null ? Math.min(200, Math.max(1, options.limit)) : 50
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/digests/schedules/${enc}/runs?limit=${lim}`, {
        headers: apiHeaders({}, options),
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<DigestScheduleRunOut[]>
}

export async function createDigest(
  baseUrl: string,
  body: DigestRequest,
  options?: { signal?: AbortSignal; accessToken?: string },
): Promise<DigestResponse> {
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/digests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...bearerHeaders(options),
          ...buildLlmClientHeaders(),
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      }),
    )
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
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/documents/pdf`, {
        method: 'POST',
        headers,
        body,
        signal: options?.signal,
      }),
    )
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
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/digests/periodic`, {
        method: 'POST',
        headers: { ...apiHeaders({ 'Content-Type': 'application/json' }, options), ...buildLlmClientHeaders() },
        body: JSON.stringify(body),
        signal: options?.signal,
      }),
    )
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
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/digests/schedules`, {
        headers: apiHeaders({}, options),
        signal: options?.signal,
      }),
    )
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
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/digests/schedules`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }, options),
        body: JSON.stringify(body),
        signal: options?.signal,
      }),
    )
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
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/digests/schedules/${enc}`, {
        method: 'PATCH',
        headers: apiHeaders({ 'Content-Type': 'application/json' }, options),
        body: JSON.stringify(body),
        signal: options?.signal,
      }),
    )
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
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/digests/schedules/${enc}`, {
        method: 'DELETE',
        headers: apiHeaders({}, options),
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
}

export async function fetchTrendProfiles(
  baseUrl: string,
  options?: { signal?: AbortSignal; accessToken?: string; internalKey?: string },
): Promise<TrendProfileSummary[]> {
  const r = await fetchWithAuthRetry(baseUrl, () =>
    fetch(`${baseUrl}/trends/profiles`, {
      signal: options?.signal,
      headers: apiHeaders({}, options),
    }),
  )
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<TrendProfileSummary[]>
}

export async function createTrendProfile(
  baseUrl: string,
  body: DigestProfileCreateBody,
  options?: { internalKey?: string; signal?: AbortSignal; accessToken?: string },
): Promise<DigestProfileCreated> {
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/trends/profiles`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }, options),
        body: JSON.stringify(body),
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<DigestProfileCreated>
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
  const r = await fetchWithAuthRetry(baseUrl, () =>
    fetch(`${baseUrl}/trends/profiles/${enc}/series${q}`, {
      signal: options?.signal,
      headers: authOnlyHeaders(options),
    }),
  )
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
  const r = await fetchWithAuthRetry(baseUrl, () =>
    fetch(`${baseUrl}/trends/profiles/${enc}/label`, {
      method: 'PUT',
      headers: apiHeaders({ 'Content-Type': 'application/json' }, options),
      body: JSON.stringify(body),
      signal: options?.signal,
    }),
  )
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<{ status: string; profile_id: string }>
}

export async function fetchTrendSnapshot(
  baseUrl: string,
  profileId: string,
  period: string,
  options?: { userId?: string; signal?: AbortSignal; accessToken?: string },
): Promise<TrendSnapshotDetail> {
  const enc = encodeURIComponent(profileId)
  const per = encodeURIComponent(period)
  const q = options?.userId?.trim() ? `?user_id=${encodeURIComponent(options.userId.trim())}` : ''
  const r = await fetchWithAuthRetry(baseUrl, () =>
    fetch(`${baseUrl}/trends/profiles/${enc}/snapshots/${per}${q}`, {
      headers: apiHeaders({}, options),
      signal: options?.signal,
    }),
  )
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<TrendSnapshotDetail>
}

export async function fetchTrendHighlights(
  baseUrl: string,
  profileId: string,
  options?: { userId?: string; signal?: AbortSignal; accessToken?: string },
): Promise<TrendHighlightsResponse> {
  const enc = encodeURIComponent(profileId)
  const q = options?.userId?.trim() ? `?user_id=${encodeURIComponent(options.userId.trim())}` : ''
  const r = await fetchWithAuthRetry(baseUrl, () =>
    fetch(`${baseUrl}/trends/profiles/${enc}/highlights${q}`, {
      signal: options?.signal,
      headers: authOnlyHeaders(options),
    }),
  )
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<TrendHighlightsResponse>
}

export async function postTrendAnalysis(
  baseUrl: string,
  profileId: string,
  options?: {
    force?: boolean
    internalKey?: string
    signal?: AbortSignal
    accessToken?: string
  },
): Promise<TrendAnalysisResponse> {
  const enc = encodeURIComponent(profileId)
  const q = options?.force ? '?force=true' : ''
  let r: Response
  try {
    r = await fetchWithAuthRetry(baseUrl, () =>
      fetch(`${baseUrl}/trends/profiles/${enc}/analysis${q}`, {
        method: 'POST',
        headers: apiHeaders({}, options),
        signal: options?.signal,
      }),
    )
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<TrendAnalysisResponse>
}

export async function deleteTrendProfile(
  baseUrl: string,
  profileId: string,
  options?: { internalKey?: string; signal?: AbortSignal; accessToken?: string },
): Promise<void> {
  const enc = encodeURIComponent(profileId)
  const r = await fetchWithAuthRetry(baseUrl, () =>
    fetch(`${baseUrl}/trends/profiles/${enc}`, {
      method: 'DELETE',
      headers: apiHeaders({}, options),
      signal: options?.signal,
    }),
  )
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
}
