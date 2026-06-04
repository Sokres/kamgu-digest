import { profileDisplayName } from '@/components/ProfileDirectionPicker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  scheduleLastStatusIsFailure,
  scheduleLastStatusLabel,
  scheduleLastStatusVariant,
} from '@/lib/scheduleStatusBadge'
import type { DigestSchedulesListResponse, TrendProfileSummary } from '@/types/api'

type DigestScheduleStatusProps = {
  profileId: string
  trendProfiles: TrendProfileSummary[]
  digestSchedules: DigestSchedulesListResponse | null
  loading: boolean
}

function pickLatestRun(
  items: DigestSchedulesListResponse['items'],
): { at: string; status: string | null; error: string | null } | null {
  let best: { at: string; status: string | null; error: string | null } | null = null
  for (const s of items) {
    if (!s.last_run_at) continue
    if (!best || s.last_run_at > best.at) {
      best = { at: s.last_run_at, status: s.last_status ?? null, error: s.last_error ?? null }
    }
  }
  return best
}

export function DigestScheduleStatus({
  profileId,
  trendProfiles,
  digestSchedules,
  loading,
}: DigestScheduleStatusProps) {
  if (!profileId) return null

  const prof = trendProfiles.find((p) => p.profile_id === profileId)
  const label = profileDisplayName(
    prof ?? { profile_id: profileId, snapshot_count: 0, topic_queries: [], work_count_last: 0 },
  )

  const profileItems =
    digestSchedules?.items.filter((s) => s.profile_id === profileId) ?? []
  const enabledCount = profileItems.filter((s) => s.enabled).length
  const latest = pickLatestRun(profileItems)
  const schedulerOff =
    digestSchedules && !digestSchedules.scheduler_enabled_in_config

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base">Автозапуск для «{label}»</CardTitle>
        <CardDescription className="text-pretty">
          Статус планировщика и последнего cron-запуска.{' '}
          <a href="#schedule" className="text-primary underline-offset-2 hover:underline">
            К настройке расписания
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !digestSchedules ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : null}

        {digestSchedules ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant={digestSchedules.scheduler_enabled_in_config ? 'default' : 'secondary'}>
              конфиг: {digestSchedules.scheduler_enabled_in_config ? 'вкл' : 'выкл'}
            </Badge>
            <Badge variant={digestSchedules.scheduler_running ? 'default' : 'outline'}>
              процесс: {digestSchedules.scheduler_running ? 'запущен' : 'не запущен'}
            </Badge>
            <Badge variant="outline">
              расписаний: {profileItems.length}
              {enabledCount !== profileItems.length ? ` (${enabledCount} вкл.)` : ''}
            </Badge>
            {latest ? (
              <Badge variant={scheduleLastStatusVariant(latest.status)}>
                последний: {scheduleLastStatusLabel(latest.status)} · {latest.at}
              </Badge>
            ) : profileItems.length > 0 ? (
              <Badge variant="outline">ещё не запускалось</Badge>
            ) : null}
          </div>
        ) : null}

        {latest?.error ? (
          <p className="text-xs text-destructive break-words">{latest.error}</p>
        ) : null}

        {schedulerOff ? (
          <Alert>
            <AlertDescription className="text-pretty text-sm">
              Встроенный планировщик на сервере выключен (переменная{' '}
              <code className="text-xs">DIGEST_PERIODIC_SCHEDULER_ENABLED</code>). Подробнее в{' '}
              <code className="text-xs">deploy/README.md</code>.
            </AlertDescription>
          </Alert>
        ) : null}

        {latest && scheduleLastStatusIsFailure(latest.status) ? (
          <Alert variant="destructive">
            <AlertDescription className="text-sm">
              Последний автозапуск завершился с ошибкой — откройте журнал в блоке расписания ниже.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
