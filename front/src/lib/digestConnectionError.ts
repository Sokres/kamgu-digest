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
        `Соединение с API оборвалось до ответа. На сервере дайджест часто считается 3–7 минут при ${RECOMMENDED_MAX_CANDIDATES} статьях` +
        ` (сейчас ${current}). «Макс. найденных статей» уменьшено до ${RECOMMENDED_MAX_CANDIDATES} — не закрывайте вкладку и повторите.`,
    }
  }

  return {
    nextMaxCandidates: null,
    message:
      'Соединение с API оборвалось до ответа. На сервере дайджест часто считается 3–7 минут — не закрывайте вкладку и повторите. ' +
      'Если ошибка повторяется, проверьте таймаут reverse proxy (Caddy/Nginx) на сервере.',
  }
}
