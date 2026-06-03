import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ProfileDirectionPicker, profileDisplayName } from '@/components/ProfileDirectionPicker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, createMonthlyDigest, createTrendProfile } from '@/lib/api'
import type { DigestFormState } from '@/hooks/useDigestFormState'
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

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Снимок и сравнение с прошлым периодом</CardTitle>
        <CardDescription className="text-pretty">
          Сохраняет снимок в базе для графиков на странице{' '}
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
              </p>
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

          <div className="space-y-2">
            <Label htmlFor="snap-force">Период снимка (YYYY-MM, необязательно)</Label>
            <Input
              id="snap-force"
              value={form.forcePeriod}
              onChange={(e) => form.setForcePeriod(e.target.value)}
              placeholder="2025-03 — переопределить период"
            />
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
            {loading ? 'Формирование…' : 'Запустить снимок'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
