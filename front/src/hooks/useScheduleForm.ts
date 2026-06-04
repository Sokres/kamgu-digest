import { useCallback, useState } from 'react'

import {
  buildCronUtc,
  inferScheduleFromCron,
  type ScheduleFrequencyId,
} from '@/lib/scheduleLabels'

export type ScheduleFormFieldsState = {
  preset: ScheduleFrequencyId
  hourUtc: number
  minuteUtc: number
  weekday: number
  cron: string
  topicText: string
}

function stateFromCron(cronUtc: string, topicText = ''): ScheduleFormFieldsState {
  const inferred = inferScheduleFromCron(cronUtc)
  const preset: ScheduleFrequencyId =
    inferred.frequency === 'custom' ? 'custom' : inferred.frequency
  return {
    preset,
    hourUtc: inferred.hour,
    minuteUtc: inferred.minute,
    weekday: inferred.weekday,
    cron:
      inferred.frequency === 'custom'
        ? cronUtc
        : buildCronUtc(inferred.frequency, inferred.hour, inferred.minute, inferred.weekday),
    topicText,
  }
}

export function useScheduleForm(initialCron = '0 6 1 * *', initialTopicText = '') {
  const [fields, setFields] = useState<ScheduleFormFieldsState>(() =>
    stateFromCron(initialCron, initialTopicText),
  )

  const resetFromCron = useCallback((cronUtc: string, topicText = '') => {
    setFields(stateFromCron(cronUtc, topicText))
  }, [])

  const setPreset = useCallback((freq: ScheduleFrequencyId) => {
    setFields((prev) => {
      const nextCron =
        freq !== 'custom' ? buildCronUtc(freq, prev.hourUtc, prev.minuteUtc, prev.weekday) : prev.cron
      return { ...prev, preset: freq, cron: nextCron }
    })
  }, [])

  const setHourUtc = useCallback((hour: number) => {
    setFields((prev) => ({
      ...prev,
      hourUtc: hour,
      cron: prev.preset !== 'custom' ? buildCronUtc(prev.preset, hour, prev.minuteUtc, prev.weekday) : prev.cron,
    }))
  }, [])

  const setMinuteUtc = useCallback((minute: number) => {
    setFields((prev) => ({
      ...prev,
      minuteUtc: minute,
      cron: prev.preset !== 'custom' ? buildCronUtc(prev.preset, prev.hourUtc, minute, prev.weekday) : prev.cron,
    }))
  }, [])

  const setWeekday = useCallback((weekday: number) => {
    setFields((prev) => ({
      ...prev,
      weekday,
      cron: prev.preset !== 'custom' ? buildCronUtc(prev.preset, prev.hourUtc, prev.minuteUtc, weekday) : prev.cron,
    }))
  }, [])

  const setCron = useCallback((cron: string) => {
    const inferred = inferScheduleFromCron(cron)
    setFields((prev) => ({
      ...prev,
      cron,
      ...(inferred.frequency !== 'custom'
        ? {
            preset: inferred.frequency,
            hourUtc: inferred.hour,
            minuteUtc: inferred.minute,
            weekday: inferred.weekday,
          }
        : { preset: 'custom' as ScheduleFrequencyId }),
      topicText: prev.topicText,
    }))
  }, [])

  const setTopicText = useCallback((topicText: string) => {
    setFields((prev) => ({ ...prev, topicText }))
  }, [])

  return {
    fields,
    setPreset,
    setHourUtc,
    setMinuteUtc,
    setWeekday,
    setCron,
    setTopicText,
    resetFromCron,
  }
}
