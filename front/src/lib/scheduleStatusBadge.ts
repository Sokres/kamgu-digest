export function scheduleLastStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  const s = status.toLowerCase()
  if (s === 'ok' || s === 'success') return 'OK'
  if (s === 'error' || s === 'failed') return 'Ошибка'
  return status
}

export function scheduleLastStatusVariant(
  status: string | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!status) return 'outline'
  const s = status.toLowerCase()
  if (s === 'ok' || s === 'success') return 'default'
  if (s === 'error' || s === 'failed') return 'destructive'
  return 'secondary'
}

export function scheduleLastStatusIsFailure(status: string | null | undefined): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return s === 'error' || s === 'failed'
}
