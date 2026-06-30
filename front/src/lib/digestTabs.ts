export type DigestTabId = 'once' | 'snapshot'

export const DIGEST_TABS: { id: DigestTabId; label: string }[] = [
  { id: 'once', label: 'Новый дайджест' },
  { id: 'snapshot', label: 'Мониторинг' },
]

export function parseDigestTab(raw: string | null): DigestTabId {
  if (raw === 'snapshot' || raw === 'schedule') return 'snapshot'
  return 'once'
}

export const DIGEST_TAB_SUBTITLES: Record<DigestTabId, string> = {
  once: 'Быстрый обзор литературы по теме — RU/EN, карточки источников и экспорт',
  snapshot:
    'Сохранение снимков по месяцам, автозапуск и сравнение научного направления',
}
