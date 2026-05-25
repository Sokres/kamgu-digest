import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { DigestResultView } from '@/components/DigestResultView'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ApiError, fetchPublicSavedDigest } from '@/lib/api'
import { getApiBaseUrl } from '@/lib/settings'
import type { SavedDigestOut } from '@/types/api'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function SharedDigestContent(props: { token: string; apiBase: string }) {
  const { token, apiBase } = props
  const [data, setData] = useState<SavedDigestOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublicSavedDigest(apiBase, token)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setData(null)
          setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiBase, token])

  return (
    <>
      {data ? (
        <div className="space-y-2 border-b border-border/60 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
          <p className="text-sm text-muted-foreground">{formatWhen(data.created_at)}</p>
        </div>
      ) : null}

      <DigestResultView loading={loading} error={error} data={data?.digest_response ?? undefined} />
    </>
  )
}

/** Публичная страница по ссылке: /shared/digest/:token (без входа в приложение). */
export function SharedDigestPage() {
  const { token } = useParams<{ token: string }>()
  const apiBase = getApiBaseUrl()
  const trimmed = (token ?? '').trim()

  if (!trimmed) {
    return (
      <div className="min-h-svh bg-background px-4 py-8 md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link to="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Войти в приложение
          </Link>
          <Alert variant="destructive">
            <AlertTitle>Ошибка</AlertTitle>
            <AlertDescription>Некорректная ссылка (нет токена).</AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Просмотр по общей ссылке (только чтение)</p>
          <Link to="/login" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Войти в приложение
          </Link>
        </div>
        <SharedDigestContent key={`${apiBase}-${trimmed}`} token={trimmed} apiBase={apiBase} />
      </div>
    </div>
  )
}
