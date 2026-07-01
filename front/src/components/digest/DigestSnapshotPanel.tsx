import { useState } from 'react'
import { Link } from 'react-router-dom'

import { DigestPresetsBar } from '@/components/DigestPresetsBar'
import { ProfileDirectionPicker } from '@/components/ProfileDirectionPicker'
import { profileDisplayName } from '@/lib/profileDisplay'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiError, createMonthlyDigest, createTrendProfile } from '@/lib/api'
import type { DigestFormState } from '@/hooks/useDigestFormState'
import { forcePeriodHint, forcePeriodPlaceholder, periodModeLabel } from '@/lib/periodMode'
import { getMonthlyInternalKey } from '@/lib/settings'
import type { MonthlyDigestResponse, TrendProfileSummary } from '@/types/api'

type DigestSnapshotPanelProps = {
  apiBase: string
  form: DigestFormState
  trendProfiles: TrendProfileSummary[]
  profilesLoading: boolean
  onRefreshProfiles: (preferProfileId?: string) => void
  onResult: (data: MonthlyDigestResponse | null, error: string | null) => void
  loading: boolean
  setLoading: (v: boolean) => void
}

export function DigestSnapshotPanel({
  apiBase,
  form,
  trendProfiles,
  profilesLoading,
  onRefreshProfiles,
  onResult,
  loading,
  setLoading,
}: DigestSnapshotPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [newProfileName, setNewProfileName] = useState('')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [lastMeta, setLastMeta] = useState<MonthlyDigestResponse['meta'] | null>(null)

  async function handleCreateProfile() {
    const name = newProfileName.trim()
    setError(null)
    if (!name) {
      setError('Введите название нового направления.')
      return
    }
    const internalKey = form.internalKeyField.trim() || getMonthlyInternalKey()
    setCreatingProfile(true)
    try {
      const res = await createTrendProfile(apiBase, { display_name: name }, { internalKey })
      setNewProfileName('')
      onRefreshProfiles(res.profile_id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingProfile(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const built = form.buildMonthlyRequest(form.selectedProfileId)
    if (!built.ok) {
      setError(built.message)
      onResult(null, built.message)
      return
    }

    const internalKey = form.internalKeyField.trim() || getMonthlyInternalKey()
    setLoading(true)
    onResult(null, null)
    setLastMeta(null)
    try {
      const res = await createMonthlyDigest(apiBase, built.body, { internalKey })
      setLastMeta(res.meta ?? null)
      onResult(res, null)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)
      setError(msg)
      onResult(null, msg)
    } finally {
      setLoading(false)
    }
  }

  const selectedProfile = trendProfiles.find((p) => p.profile_id === form.selectedProfileId)
  const snapshotCount = selectedProfile?.snapshot_count ?? 0

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Мониторинг направления</CardTitle>
        <CardDescription className="text-pretty">
          Фиксирует результаты за месяц и сравнивает с прошлым периодом. Графики — на странице{' '}
          <Link to="/trends" className="text-primary underline-offset-2 hover:underline">
            Тренды
          </Link>
          . Ориентир 5–15 минут.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Направление</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={profilesLoading}
                onClick={() => onRefreshProfiles()}
              >
                {profilesLoading ? '…' : 'Обновить список'}
              </Button>
            </div>
            <ProfileDirectionPicker
              profiles={trendProfiles}
              selectedId={form.selectedProfileId}
              onSelect={form.setSelectedProfileId}
              disabled={profilesLoading}
            />
            {form.selectedProfileId ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Выбрано:{' '}
                  <span className="font-medium text-foreground">
                    {profileDisplayName(
                      selectedProfile ?? {
                        profile_id: form.selectedProfileId,
                        snapshot_count: 0,
                        topic_queries: [],
                        work_count_last: 0,
                      },
                    )}
                  </span>
                  {selectedProfile ? (
                    <span className="ml-2 text-xs">
                      Периодов: {snapshotCount}
                      {selectedProfile.last_period ? ` · последний ${selectedProfile.last_period}` : ''}
                    </span>
                  ) : null}
                </p>
                {selectedProfile && snapshotCount < 2 ? (
                  <Alert className="border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <AlertDescription className="text-pretty text-sm text-amber-950/90 dark:text-amber-50/90">
                      Для выводов в «Трендах» нужен минимум второй снимок. При ежедневном режиме каждый новый день
                      создаёт отдельную точку (`YYYY-MM-DD`); повторный запуск в тот же день обновляет существующий
                      снимок.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid min-w-[200px] flex-1 gap-2">
                <Label htmlFor="snap-new-prof">Новое направление</Label>
                <Input
                  id="snap-new-prof"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="Например: Квантовые материалы"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={creatingProfile}
                onClick={() => void handleCreateProfile()}
              >
                {creatingProfile ? 'Создание…' : 'Создать направление'}
              </Button>
            </div>
          </div>

          <DigestPresetsBar onApply={form.applyPreset} snapshot={form.presetSnapshot} />

          <Alert className="print:hidden">
            <AlertDescription className="text-pretty text-sm">
              Темы и лимиты из общего блока выше применяются к следующему снимку и новым записям расписания. Уже
              сохранённые точки на странице «Тренды» не пересчитываются.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="snap-period-mode">Гранулярность снимка</Label>
              <Select
                value={form.periodMode}
                onValueChange={(v) => form.setPeriodMode(v as typeof form.periodMode)}
              >
                <SelectTrigger id="snap-period-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">По дням — рекомендуется для ежедневного мониторинга</SelectItem>
                  <SelectItem value="month">По месяцам — одна точка на календарный месяц</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{periodModeLabel(form.periodMode)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="snap-force">{forcePeriodHint(form.periodMode)}</Label>
              <Input
                id="snap-force"
                value={form.forcePeriod}
                onChange={(e) => form.setForcePeriod(e.target.value)}
                placeholder={forcePeriodPlaceholder(form.periodMode)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="snap-x-int">Сервисный ключ (если нужен; иначе — из «Настройки»)</Label>
            <Input
              id="snap-x-int"
              value={form.internalKeyField}
              onChange={(e) => form.setInternalKeyField(e.target.value)}
              placeholder="оставьте пустым — возьмём из настроек"
              autoComplete="off"
            />
          </div>

          {lastMeta ? (
            <div className="flex flex-wrap gap-2">
              {lastMeta.profile_id ? (
                <Badge variant="secondary">Профиль: {lastMeta.profile_id}</Badge>
              ) : null}
              {lastMeta.period ? <Badge variant="outline">период: {lastMeta.period}</Badge> : null}
              {lastMeta.compared_period != null && lastMeta.compared_period !== '' ? (
                <Badge variant="outline">сравнение с: {lastMeta.compared_period}</Badge>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={loading} size="lg" className="min-w-[240px]">
            {loading ? 'Формирование…' : 'Сохранить и сравнить'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
