import { inferScheduleFromCron } from '@/lib/scheduleLabels'

export type SnapshotPeriodMode = 'month' | 'day'

export function inferPeriodModeFromCron(cron: string): SnapshotPeriodMode {
  const { frequency } = inferScheduleFromCron(cron)
  if (frequency === 'daily' || frequency === 'weekly') return 'day'
  if (frequency === 'monthly' || frequency === 'quarter') return 'month'
  return 'day'
}

export function periodModeLabel(mode: SnapshotPeriodMode): string {
  return mode === 'day' ? 'по дням (YYYY-MM-DD)' : 'по месяцам (YYYY-MM)'
}

export function forcePeriodPlaceholder(mode: SnapshotPeriodMode): string {
  return mode === 'day' ? '2026-07-01 — переопределить день' : '2026-07 — переопределить месяц'
}

export function forcePeriodHint(mode: SnapshotPeriodMode): string {
  return mode === 'day'
    ? 'Период снимка (YYYY-MM-DD, необязательно)'
    : 'Период снимка (YYYY-MM, необязательно)'
}
