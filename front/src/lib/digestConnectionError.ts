const RECOMMENDED_MAX_CANDIDATES = 30

export function resolveDigestConnectionError(maxCandidatesRaw: string): {
  message: string
  nextMaxCandidates: string | null
} {
  const current = Number.parseInt(maxCandidatesRaw, 10)
  const hasCurrent = Number.isFinite(current)

  if (hasCurrent && current > RECOMMENDED_MAX_CANDIDATES) {
    return {
      nextMaxCandidates: String(RECOMMENDED_MAX_CANDIDATES),
      message:
        `Не удалось получить статус дайджеста при ${current} статьях. «Макс. найденных статей» уменьшено до ${RECOMMENDED_MAX_CANDIDATES} — повторите через минуту.`,
    }
  }

  return {
    nextMaxCandidates: null,
    message:
      'Не удалось получить статус дайджеста (сеть или сервер). Подождите минуту и повторите. ' +
      'Если ошибка повторяется, проверьте логи API и таймаут reverse proxy (Caddy/Nginx).',
  }
}
