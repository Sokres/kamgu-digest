import type {
  DigestRequest,
  DigestResponse,
  MonthlyDigestRequest,
  MonthlyDigestResponse,
  TrendProfileLabelUpdate,
  TrendProfileSummary,
  TrendSeriesResponse,
} from '@/types/api'

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

export async function fetchHealth(baseUrl: string): Promise<{ status: string }> {
  const r = await fetch(`${baseUrl}/health`)
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<{ status: string }>
}

export async function createDigest(
  baseUrl: string,
  body: DigestRequest,
  signal?: AbortSignal,
): Promise<DigestResponse> {
  let r: Response
  try {
    r = await fetch(`${baseUrl}/digests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<DigestResponse>
}

export async function createMonthlyDigest(
  baseUrl: string,
  body: MonthlyDigestRequest,
  options?: { internalKey?: string; signal?: AbortSignal },
): Promise<MonthlyDigestResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = (options?.internalKey ?? '').trim()
  if (key) headers['X-Internal-Key'] = key

  let r: Response
  try {
    r = await fetch(`${baseUrl}/digests/periodic`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    })
  } catch (e) {
    mapFetchError(e)
  }
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<MonthlyDigestResponse>
}

export async function fetchTrendProfiles(baseUrl: string, signal?: AbortSignal): Promise<TrendProfileSummary[]> {
  const r = await fetch(`${baseUrl}/trends/profiles`, { signal })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<TrendProfileSummary[]>
}

export async function fetchTrendSeries(
  baseUrl: string,
  profileId: string,
  signal?: AbortSignal,
): Promise<TrendSeriesResponse> {
  const enc = encodeURIComponent(profileId)
  const r = await fetch(`${baseUrl}/trends/profiles/${enc}/series`, { signal })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<TrendSeriesResponse>
}

export async function putTrendProfileLabel(
  baseUrl: string,
  profileId: string,
  body: TrendProfileLabelUpdate,
  options?: { internalKey?: string; signal?: AbortSignal },
): Promise<{ status: string; profile_id: string }> {
  const enc = encodeURIComponent(profileId)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = (options?.internalKey ?? '').trim()
  if (key) headers['X-Internal-Key'] = key

  const r = await fetch(`${baseUrl}/trends/profiles/${enc}/label`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<{ status: string; profile_id: string }>
}
