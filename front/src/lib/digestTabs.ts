export type DigestTabId = 'once' | 'snapshot'

export const DIGEST_TABS: { id: DigestTabId; label: string }[] = [
  { id: 'once', label: 'Разовый' },
  { id: 'snapshot', label: 'Снимок, тренды и расписание' },
]

export function parseDigestTab(raw: string | null): DigestTabId {
  if (raw === 'snapshot' || raw === 'schedule') return 'snapshot'
  return 'once'
}

export const DIGEST_TAB_SUBTITLES: Record<DigestTabId, string> = {
  once: 'Разовый обзор литературы по темам — текст RU/EN и список источников',
  snapshot:
    'Направление: снимок в базу, сравнение с прошлым периодом, автозапуск по расписанию и графики на «Тренды»',
}
