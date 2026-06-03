import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

import { PageOnboarding } from '@/components/PageOnboarding'
import { profileDisplayName } from '@/components/ProfileDirectionPicker'
import { TrendAreaChart } from '@/components/TrendAreaChart'
import { TrendCompareChart } from '@/components/TrendCompareChart'
import { TrendDeltaBarChart } from '@/components/TrendDeltaBarChart'
import { TrendKpiCards } from '@/components/TrendKpiCards'
import { TrendSeriesChart } from '@/components/TrendSeriesChart'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, createTrendProfile, fetchTrendProfiles, fetchTrendSeries, putTrendProfileLabel } from '@/lib/api'
import { deltaSignedClass } from '@/lib/deltaClass'
import { getMonthlyInternalKey } from '@/lib/settings'
import type { TrendProfileSummary, TrendSeriesPoint } from '@/types/api'
import { cn } from '@/lib/utils'

const COMPARE_NONE = '__none__'

export function TrendsPage() {
  const { apiBase } = useOutletContext<{ apiBase: string }>()
  const [profiles, setProfiles] = useState<TrendProfileSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [points, setPoints] = useState<TrendSeriesPoint[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingSeries, setLoadingSeries] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [labelName, setLabelName] = useState('')
  const [labelNote, setLabelNote] = useState('')
  const [savingLabel, setSavingLabel] = useState(false)
  const [labelMsg, setLabelMsg] = useState<string | null>(null)
  const [compareId, setCompareId] = useState<string>(COMPARE_NONE)
  const [comparePoints, setComparePoints] = useState<TrendSeriesPoint[]>([])
  const [loadingCompare, setLoadingCompare] = useState(false)

  const [newTrendName, setNewTrendName] = useState('')
  const [creatingTrend, setCreatingTrend] = useState(false)

  const loadProfiles = useCallback(async (preferProfileId?: string) => {
    setLoadingList(true)
    setError(null)
    try {
      const list = await fetchTrendProfiles(apiBase, { internalKey: getMonthlyInternalKey() })
      setProfiles(list)
      const prefer = preferProfileId?.trim()
      setSelectedId((prev) => {
        if (prefer && list.some((p) => p.profile_id === prefer)) return prefer
        if (prev && list.some((p) => p.profile_id === prev)) return prev
        return list[0]?.profile_id ?? null
      })
    } catch (e) {
      setProfiles([])
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingList(false)
    }
  }, [apiBase])

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  async function handleCreateTrendProfile() {
    const name = newTrendName.trim()
    if (!name) {
      setError('Введите название направления.')
      return
    }
    setCreatingTrend(true)
    setError(null)
    try {
      const res = await createTrendProfile(
        apiBase,
        { display_name: name },
        { internalKey: getMonthlyInternalKey() },
      )
      setNewTrendName('')
      await loadProfiles(res.profile_id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setCreatingTrend(false)
    }
  }

  const selectedProfile = profiles.find((p) => p.profile_id === selectedId)

  useEffect(() => {
    if (!selectedId) {
      setPoints([])
      return
    }
    const prof = profiles.find((p) => p.profile_id === selectedId)
    let cancelled = false
    setLoadingSeries(true)
    setError(null)
    fetchTrendSeries(apiBase, selectedId, {
      userId: prof?.user_id,
    })
      .then((res) => {
        if (!cancelled) {
          setPoints(res.points)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPoints([])
          setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiBase, selectedId, profiles])

  useEffect(() => {
    if (compareId !== COMPARE_NONE && compareId === selectedId) {
      setCompareId(COMPARE_NONE)
    }
  }, [selectedId, compareId])

  useEffect(() => {
    if (!selectedId || compareId === COMPARE_NONE || compareId === selectedId) {
      setComparePoints([])
      return
    }
    const prof = profiles.find((p) => p.profile_id === compareId)
    let cancelled = false
    setLoadingCompare(true)
    fetchTrendSeries(apiBase, compareId, { userId: prof?.user_id })
      .then((res) => {
        if (!cancelled) setComparePoints(res.points)
      })
      .catch(() => {
        if (!cancelled) setComparePoints([])
      })
      .finally(() => {
        if (!cancelled) setLoadingCompare(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiBase, compareId, selectedId, profiles])

  useEffect(() => {
    if (!selectedProfile) {
      if (selectedId) {
        setLabelName(selectedId)
        setLabelNote('')
      }
      return
    }
    setLabelName((selectedProfile.display_name ?? '').trim() || selectedProfile.profile_id)
    setLabelNote(selectedProfile.note ?? '')
  }, [selectedProfile, selectedId])

  const maxWork = Math.max(1, ...points.map((p) => p.work_count))
  const compareProfile = profiles.find((p) => p.profile_id === compareId)
  const showCompare =
    compareId !== COMPARE_NONE &&
    compareId !== selectedId &&
    comparePoints.length > 0 &&
    !loadingSeries

  async function handleSaveLabel(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setLabelMsg(null)
    setSavingLabel(true)
    try {
      await putTrendProfileLabel(
        apiBase,
        selectedId,
        { display_name: labelName.trim(), note: labelNote.trim() },
        { internalKey: getMonthlyInternalKey() },
      )
      setLabelMsg('Сохранено')
      await loadProfiles()
    } catch (err) {
      setLabelMsg(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setSavingLabel(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageOnboarding
        title="Тренды по сохранённым снимкам"
        steps={[
          {
            title: 'Накопление данных',
            detail:
              'Профили появляются после периодического дайджеста с тем же идентификатором профиля; чем больше запусков, тем полнее ряд.',
          },
          {
            title: 'Графики и KPI',
            detail:
              'Сводные карточки, столбцы+линия по размеру топа, отдельно — прирост к прошлому месяцу, площадной тренд и таблица.',
          },
          {
            title: 'Подпись профиля',
            detail:
              'Можно задать удобное имя и заметку для отображения в списке. Если на сервере включена проверка служебного ключа — используйте тот же ключ, что в «Настройки».',
          },
        ]}
      />

      <div className="text-sm text-muted-foreground print:hidden">
        Здесь отображаются сохранённые ежемесячные снимки по направлениям: сводные показатели, динамика размера топа,
        прирост к прошлому периоду и сравнение двух направлений на одном графике. Число «работ в топе» — сколько статей
        попало в ваш фиксированный топ в выбранном месяце.
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Профили</CardTitle>
          <CardDescription>
            Направления создаются с человекочитаемым именем (UUID задаётся сервером). После первого сохранённого снимка
            появятся точки на графиках.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <div className="grid min-w-[200px] flex-1 gap-2">
              <Label htmlFor="new-trend-name">Новое направление</Label>
              <Input
                id="new-trend-name"
                value={newTrendName}
                onChange={(e) => setNewTrendName(e.target.value)}
                placeholder="Название линии исследований"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={creatingTrend}
              onClick={() => void handleCreateTrendProfile()}
            >
              {creatingTrend ? 'Создание…' : 'Создать'}
            </Button>
          </div>
          {loadingList ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Пока нет направлений — создайте одно полем выше или на странице{' '}
              <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/?tab=snapshot">
                дайджеста (вкладка «Снимок»)
              </Link>
              . Снимки появятся после первого успешного запуска дайджеста для выбранного направления.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead className="hidden sm:table-cell">Id профиля</TableHead>
                  <TableHead className="text-right">Снимков</TableHead>
                  <TableHead className="hidden md:table-cell">Последний период</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const active = p.profile_id === selectedId
                  return (
                    <TableRow
                      key={p.profile_id}
                      className={cn('cursor-pointer', active && 'bg-muted/50')}
                      onClick={() => setSelectedId(p.profile_id)}
                    >
                      <TableCell className="min-w-0 font-medium">{profileDisplayName(p)}</TableCell>
                      <TableCell className="hidden min-w-0 break-all font-mono text-xs text-muted-foreground sm:table-cell">
                        {p.profile_id}
                      </TableCell>
                      <TableCell className="text-right">{p.snapshot_count}</TableCell>
                      <TableCell className="hidden md:table-cell">{p.last_period ?? '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void loadProfiles()} disabled={loadingList}>
            Обновить список
          </Button>
        </CardContent>
      </Card>

      {selectedId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Динамика
              {selectedProfile ? (
                <Badge variant="secondary" className="font-mono font-normal">
                  {selectedProfile.profile_id}
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-mono font-normal">
                  {selectedId}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Изменение размера топа работ по сравнению с прошлым сохранённым периодом (месяц). Ниже можно наложить два
              направления на один график.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingSeries ? (
              <p className="text-sm text-muted-foreground">Загрузка ряда…</p>
            ) : points.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет точек для этого профиля.</p>
            ) : (
              <>
                {profiles.length > 1 ? (
                  <div className="grid max-w-md gap-2 print:hidden">
                    <Label htmlFor="trend-compare">Сравнить с профилем</Label>
                    <Select value={compareId} onValueChange={setCompareId}>
                      <SelectTrigger id="trend-compare" className="w-full sm:w-[min(100%,380px)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={COMPARE_NONE}>Не сравнивать</SelectItem>
                        {profiles
                          .filter((p) => p.profile_id !== selectedId)
                          .map((p) => (
                            <SelectItem key={p.profile_id} value={p.profile_id}>
                              {profileDisplayName(p)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {compareId !== COMPARE_NONE && compareId !== selectedId && loadingCompare ? (
                      <p className="text-xs text-muted-foreground">Загрузка ряда для сравнения…</p>
                    ) : null}
                    {compareId !== COMPARE_NONE &&
                    compareId !== selectedId &&
                    !loadingCompare &&
                    comparePoints.length === 0 ? (
                      <p className="text-xs text-amber-800 dark:text-amber-100/90">
                        Для выбранного профиля нет точек — показан только график текущего.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-4 print:hidden">
                  <TrendKpiCards points={points} />
                  {showCompare ? (
                    <TrendCompareChart
                      seriesA={points}
                      seriesB={comparePoints}
                      labelA={selectedProfile ? profileDisplayName(selectedProfile) : selectedId ?? ''}
                      labelB={compareProfile ? profileDisplayName(compareProfile) : compareId}
                    />
                  ) : (
                    <TrendSeriesChart points={points} maxWork={maxWork} />
                  )}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <TrendDeltaBarChart points={points} />
                    <TrendAreaChart points={points} />
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Период</TableHead>
                      <TableHead className="text-right">Работ в топе</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Δ к прошлому</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Δ %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {points.map((p) => (
                      <TableRow key={p.period}>
                        <TableCell className="font-mono text-sm">{p.period}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.work_count}</TableCell>
                        <TableCell
                          className={cn(
                            'hidden text-right sm:table-cell',
                            deltaSignedClass(p.delta_vs_prev ?? null),
                          )}
                        >
                          {p.delta_vs_prev == null ? '—' : p.delta_vs_prev > 0 ? `+${p.delta_vs_prev}` : String(p.delta_vs_prev)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'hidden text-right md:table-cell',
                            deltaSignedClass(p.pct_change_vs_prev ?? null),
                          )}
                        >
                          {p.pct_change_vs_prev == null ? '—' : `${p.pct_change_vs_prev > 0 ? '+' : ''}${p.pct_change_vs_prev}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            <form className="space-y-3 border-t border-border/60 pt-6" onSubmit={handleSaveLabel}>
              <p className="text-sm font-medium">Подпись в интерфейсе</p>
              <p className="text-xs text-muted-foreground">
                Сохраняется на сервере. Если администратор включил проверку служебного ключа для автоматических
                запусков, укажите тот же ключ в «Настройки», что и для периодического дайджеста.
              </p>
              <div className="grid gap-2">
                <Label htmlFor="trend-label-name">Отображаемое имя</Label>
                <Input
                  id="trend-label-name"
                  value={labelName}
                  onChange={(e) => setLabelName(e.target.value)}
                  placeholder="Например: ВИЭ и сети"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trend-label-note">Заметка</Label>
                <Textarea
                  id="trend-label-note"
                  value={labelNote}
                  onChange={(e) => setLabelNote(e.target.value)}
                  rows={2}
                  placeholder="Опционально"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm" disabled={savingLabel || !labelName.trim()}>
                  {savingLabel ? 'Сохранение…' : 'Сохранить подпись'}
                </Button>
                {labelMsg ? <span className="text-sm text-muted-foreground">{labelMsg}</span> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
