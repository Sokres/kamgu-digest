import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  HOURS_24,
  MINUTES_60,
  WEEKDAY_OPTIONS,
  formatUtcTime24,
  scheduleLocalHint,
  type ScheduleFrequencyId,
} from '@/lib/scheduleLabels'

type ScheduleUtcTimeFieldsProps = {
  frequency: ScheduleFrequencyId
  hour: number
  minute: number
  weekday: number
  cronPreview: string
  onHourChange: (hour: number) => void
  onMinuteChange: (minute: number) => void
  onWeekdayChange: (weekday: number) => void
}

export function ScheduleUtcTimeFields({
  frequency,
  hour,
  minute,
  weekday,
  cronPreview,
  onHourChange,
  onMinuteChange,
  onWeekdayChange,
}: ScheduleUtcTimeFieldsProps) {
  if (frequency === 'custom') return null

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/15 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Время запуска на сервере (UTC, 24 часа)</p>
        <p className="text-xs text-muted-foreground text-pretty">
          Укажите час и минуты по Гринвичу — так же считает планировщик на VPS.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label htmlFor="sch-hour-utc">Час</Label>
          <Select value={String(hour)} onValueChange={(v) => onHourChange(Number.parseInt(v, 10))}>
            <SelectTrigger id="sch-hour-utc" className="w-[5.5rem] font-mono tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-60">
              {HOURS_24.map((h) => (
                <SelectItem key={h} value={String(h)} className="font-mono tabular-nums">
                  {String(h).padStart(2, '0')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="pb-2 text-lg font-light text-muted-foreground" aria-hidden>
          :
        </span>
        <div className="grid gap-2">
          <Label htmlFor="sch-minute-utc">Минута</Label>
          <Select value={String(minute)} onValueChange={(v) => onMinuteChange(Number.parseInt(v, 10))}>
            <SelectTrigger id="sch-minute-utc" className="w-[5.5rem] font-mono tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-60">
              {MINUTES_60.map((m) => (
                <SelectItem key={m} value={String(m)} className="font-mono tabular-nums">
                  {String(m).padStart(2, '0')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="pb-1 text-sm font-mono tabular-nums text-foreground">
          = {formatUtcTime24(hour, minute)} UTC
        </p>
      </div>
      {frequency === 'weekly' ? (
        <div className="grid max-w-xs gap-2">
          <Label htmlFor="sch-weekday">День недели</Label>
          <Select value={String(weekday)} onValueChange={(v) => onWeekdayChange(Number.parseInt(v, 10))}>
            <SelectTrigger id="sch-weekday" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {WEEKDAY_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground text-pretty">{scheduleLocalHint(cronPreview)}</p>
      <p className="font-mono text-[11px] text-muted-foreground break-all">
        Cron для сервера: {cronPreview}
      </p>
    </div>
  )
}
