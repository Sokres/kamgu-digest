export type SchedulePreset = {
  id: ScheduleFrequencyId
  label: string
  description: string
  cron: string
}

export type ScheduleFrequencyId = 'daily' | 'weekly' | 'monthly' | 'quarter' | 'custom'

export const HOURS_24 = Array.from({ length: 24 }, (_, i) => i)
export const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i)

export const WEEKDAY_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: 'Понедельник' },
  { value: '2', label: 'Вторник' },
  { value: '3', label: 'Среда' },
  { value: '4', label: 'Четверг' },
  { value: '5', label: 'Пятница' },
  { value: '6', label: 'Суббота' },
  { value: '0', label: 'Воскресенье' },
]

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    id: 'monthly',
    label: 'Раз в месяц',
    description: '1-го числа каждого месяца — новая точка тренда (рекомендуется для выводов)',
    cron: '0 6 1 * *',
  },
  {
    id: 'quarter',
    label: 'Раз в квартал',
    description: '1-го числа в январе, апреле, июле и октябре — новая точка тренда',
    cron: '0 6 1 1,4,7,10 *',
  },
  {
    id: 'weekly',
    label: 'Раз в неделю',
    description: 'Обновляет снимок текущего месяца; выводы в трендах — после следующего месяца',
    cron: '0 6 * * 1',
  },
  {
    id: 'daily',
    label: 'Каждый день',
    description: 'Обновляет снимок текущего месяца; выводы в трендах — после следующего месяца',
    cron: '0 6 * * *',
  },
  {
    id: 'custom',
    label: 'Своё расписание',
    description: 'Пять полей cron вручную (время сервера — UTC)',
    cron: '',
  },
]

export function formatUtcTime24(hour: number, minute: number): string {
  const h = Math.min(23, Math.max(0, hour))
  const m = Math.min(59, Math.max(0, minute))
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function buildCronUtc(
  frequency: Exclude<ScheduleFrequencyId, 'custom'>,
  hour: number,
  minute: number,
  weekday = 1,
): string {
  const m = Math.min(59, Math.max(0, Math.floor(minute)))
  const h = Math.min(23, Math.max(0, Math.floor(hour)))
  const dow = Math.min(6, Math.max(0, Math.floor(weekday)))
  switch (frequency) {
    case 'daily':
      return `${m} ${h} * * *`
    case 'weekly':
      return `${m} ${h} * * ${dow}`
    case 'monthly':
      return `${m} ${h} 1 * *`
    case 'quarter':
      return `${m} ${h} 1 1,4,7,10 *`
  }
}

export function parseFixedHourMinute(cron: string): { hour: number; minute: number } | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hour] = parts
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour)) return null
  const minute = Number.parseInt(min, 10)
  const h = Number.parseInt(hour, 10)
  if (minute < 0 || minute > 59 || h < 0 || h > 23) return null
  return { hour: h, minute }
}

export function inferScheduleFromCron(cron: string): {
  frequency: ScheduleFrequencyId
  hour: number
  minute: number
  weekday: number
} {
  const raw = cron.trim()
  const hm = parseFixedHourMinute(raw)
  const hour = hm?.hour ?? 6
  const minute = hm?.minute ?? 0

  const parts = raw.split(/\s+/)
  if (parts.length !== 5) {
    return { frequency: 'custom', hour, minute, weekday: 1 }
  }
  const [, , dom, mon, dow] = parts

  if (dom === '1' && mon === '1,4,7,10' && dow === '*') {
    return { frequency: 'quarter', hour, minute, weekday: 1 }
  }
  if (dom === '1' && mon === '*' && dow === '*') {
    return { frequency: 'monthly', hour, minute, weekday: 1 }
  }
  if (dom === '*' && mon === '*' && /^\d+$/.test(dow)) {
    const weekday = Number.parseInt(dow, 10)
    if (weekday >= 0 && weekday <= 6) {
      return { frequency: 'weekly', hour, minute, weekday }
    }
  }
  if (dom === '*' && mon === '*' && dow === '*') {
    return { frequency: 'daily', hour, minute, weekday: 1 }
  }

  return { frequency: 'custom', hour, minute, weekday: 1 }
}

export function scheduleLocalHint(cron: string): string {
  const hm = parseFixedHourMinute(cron)
  if (!hm) {
    return 'Время запуска задаётся на сервере в UTC. Для нестандартного cron сверяйтесь с администратором.'
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const utcLabel = `${formatUtcTime24(hm.hour, hm.minute)} UTC`
  const sample = new Date(Date.UTC(2026, 5, 1, hm.hour, hm.minute))
  const localLabel = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).format(sample)
  return `На сервере: ${utcLabel}. У вас (${tz}): ориентир ${localLabel} (для других дат смещение то же).`
}

export function describeCronFields(): string {
  return 'Пять полей через пробел: минута · час · день месяца · месяц · день недели (0 = воскресенье). Все значения в UTC.'
}
