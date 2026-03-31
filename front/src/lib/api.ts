import type {
  DigestRequest,
  DigestResponse,
  MonthlyDigestRequest,
  MonthlyDigestResponse,
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
  const r = await fetch(`${baseUrl}/digests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
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

  const r = await fetch(`${baseUrl}/digests/monthly`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  if (!r.ok) throw new ApiError(await parseFastApiDetail(r), r.status)
  return r.json() as Promise<MonthlyDigestResponse>
}
