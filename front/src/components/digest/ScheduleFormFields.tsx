import { ScheduleUtcTimeFields } from '@/components/ScheduleUtcTimeFields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ScheduleFormFieldsState } from '@/hooks/useScheduleForm'
import {
  SCHEDULE_PRESETS,
  describeCronFields,
  type ScheduleFrequencyId,
} from '@/lib/scheduleLabels'

type ScheduleFormFieldsProps = {
  idPrefix: string
  fields: ScheduleFormFieldsState
  enabled?: boolean
  showEnabled?: boolean
  onEnabledChange?: (v: boolean) => void
  onPresetChange: (freq: ScheduleFrequencyId) => void
  onHourChange: (h: number) => void
  onMinuteChange: (m: number) => void
  onWeekdayChange: (d: number) => void
  onCronChange: (cron: string) => void
  onTopicTextChange: (text: string) => void
  onTopicsFromShared: () => void
  onTopicsFromSnapshot?: () => void
  snapshotTopicsAvailable?: boolean
}

export function ScheduleFormFields({
  idPrefix,
  fields,
  enabled,
  showEnabled,
  onEnabledChange,
  onPresetChange,
  onHourChange,
  onMinuteChange,
  onWeekdayChange,
  onCronChange,
  onTopicTextChange,
  onTopicsFromShared,
  onTopicsFromSnapshot,
  snapshotTopicsAvailable,
}: ScheduleFormFieldsProps) {
  return (
    <div className="space-y-4">
      {showEnabled && onEnabledChange != null ? (
        <div className="flex items-center gap-3">
          <Switch id={`${idPrefix}-enabled`} checked={enabled ?? true} onCheckedChange={onEnabledChange} />
          <Label htmlFor={`${idPrefix}-enabled`} className="font-normal">
            Автозапуск включён
          </Label>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-preset`}>Как часто запускать</Label>
        <Select value={fields.preset} onValueChange={(id) => onPresetChange(id as ScheduleFrequencyId)}>
          <SelectTrigger
            id={`${idPrefix}-preset`}
            className="h-auto min-h-10 w-full max-w-xl py-2 whitespace-normal"
          >
            <SelectValue placeholder="Шаблон" />
          </SelectTrigger>
          <SelectContent position="popper" className="max-w-[min(100vw-2rem,28rem)]">
            {SCHEDULE_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id} className="whitespace-normal">
                <span className="block font-medium">{p.label}</span>
                <span className="block text-xs text-muted-foreground">{p.description}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScheduleUtcTimeFields
        frequency={fields.preset}
        hour={fields.hourUtc}
        minute={fields.minuteUtc}
        weekday={fields.weekday}
        cronPreview={fields.cron}
        onHourChange={onHourChange}
        onMinuteChange={onMinuteChange}
        onWeekdayChange={onWeekdayChange}
      />

      {fields.preset === 'custom' ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-cron`}>Cron (UTC)</Label>
          <Input
            id={`${idPrefix}-cron`}
            value={fields.cron}
            onChange={(e) => onCronChange(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">{describeCronFields()}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${idPrefix}-topics`}>Темы (по одной строке)</Label>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onTopicsFromShared}>
            Из общих параметров
          </Button>
          {onTopicsFromSnapshot && snapshotTopicsAvailable ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onTopicsFromSnapshot}>
              Как в последнем снимке
            </Button>
          ) : null}
        </div>
        <Textarea
          id={`${idPrefix}-topics`}
          value={fields.topicText}
          onChange={(e) => onTopicTextChange(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  )
}
