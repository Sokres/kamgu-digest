import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, fetchDigestSchedules } from '@/lib/api'
import { getMonthlyInternalKey } from '@/lib/settings'
import type { DigestSchedulesListResponse } from '@/types/api'

export function useDigestSchedules(apiBase: string, internalKeyField: string) {
  const [digestSchedules, setDigestSchedules] = useState<DigestSchedulesListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const internalKeyRef = useRef(internalKeyField)
  internalKeyRef.current = internalKeyField

  function resolveInternalKey() {
    return internalKeyRef.current.trim() || getMonthlyInternalKey()
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDigestSchedules(apiBase, { internalKey: resolveInternalKey() })
      setDigestSchedules(res)
    } catch (err) {
      setDigestSchedules(null)
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [apiBase, internalKeyField])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    digestSchedules,
    loading,
    error,
    setError,
    reload,
    scheduleInternalKey: resolveInternalKey,
  }
}
