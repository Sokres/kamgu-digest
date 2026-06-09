import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

import { PageOnboarding } from '@/components/PageOnboarding'
import { profileDisplayName, profileHasDisplayName } from '@/components/ProfileDirectionPicker'
import { TrendActivityFeed } from '@/components/trends/TrendActivityFeed'
import { TrendAnalysisPanel } from '@/components/trends/TrendAnalysisPanel'
import { TrendConceptEvolutionChart } from '@/components/trends/TrendConceptEvolutionChart'
import { TrendLatestSnapshotPanel } from '@/components/trends/TrendLatestSnapshotPanel'
import { TrendProfilesOverview } from '@/components/trends/TrendProfilesOverview'
import { TrendSnapshotSheet } from '@/components/trends/TrendSnapshotSheet'
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
import {
  ApiError,
  createTrendProfile,
  deleteTrendProfile,
  fetchTrendHighlights,
  fetchTrendProfiles,
  fetchTrendSeries,
  fetchTrendSnapshot,
  postTrendAnalysis,
  putTrendProfileLabel,
} from '@/lib/api'
import { deltaSignedClass } from '@/lib/deltaClass'
import { digestSnapshotHref } from '@/lib/digestLinks'
import { getMonthlyInternalKey } from '@/lib/settings'
import type {
  TrendAnalysisResponse,
  TrendHighlightsResponse,
  TrendProfileSummary,
  TrendSeriesPoint,
  TrendSnapshotDetail,
} from '@/types/api'
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

  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [snapshotPeriod, setSnapshotPeriod] = useState<string | null>(null)
  const [snapshotDetail, setSnapshotDetail] = useState<TrendSnapshotDetail | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [deletingProfile, setDeletingProfile] = useState(false)

  const [highlights, setHighlights] = useState<TrendHighlightsResponse | null>(null)
  const [loadingHighlights, setLoadingHighlights] = useState(false)

  const [analysis, setAnalysis] = useState<TrendAnalysisResponse | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [refreshingAnalysis, setRefreshingAnalysis] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

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
      setHighlights(null)
      setAnalysis(null)
      return
    }
    const prof = profiles.find((p) => p.profile_id === selectedId)
    let cancelled = false
    setLoadingSeries(true)
    setLoadingHighlights(true)
    setError(null)
    Promise.all([
      fetchTrendSeries(apiBase, selectedId, { userId: prof?.user_id }),
      fetchTrendHighlights(apiBase, selectedId, { userId: prof?.user_id }),
    ])
      .then(([seriesRes, highlightsRes]) => {
        if (!cancelled) {
          setPoints(seriesRes.points)
          setHighlights(highlightsRes)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPoints([])
          setHighlights(null)
          setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingSeries(false)
          setLoadingHighlights(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [apiBase, selectedId, profiles])

  const loadAnalysis = useCallback(
    async (force = false) => {
      if (!selectedId) return
      if (force) {
        setRefreshingAnalysis(true)
      } else {
        setLoadingAnalysis(true)
      }
      setAnalysisError(null)
      try {
        const res = await postTrendAnalysis(apiBase, selectedId, {
          force,
          internalKey: getMonthlyInternalKey(),
        })
        setAnalysis(res)
      } catch (e) {
        setAnalysis(null)
        setAnalysisError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
      } finally {
        setLoadingAnalysis(false)
        setRefreshingAnalysis(false)
      }
    },
    [apiBase, selectedId],
  )

  useEffect(() => {
    if (!selectedId || loadingSeries || loadingHighlights) return
    if (points.length < 2) {
      setAnalysis(null)
      setAnalysisError(null)
      return
    }
    void loadAnalysis(false)
  }, [selectedId, points.length, loadingSeries, loadingHighlights, loadAnalysis])

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

  async function openSnapshotPeriod(period: string) {
    if (!selectedId) return
    const prof = profiles.find((p) => p.profile_id === selectedId)
    setSnapshotPeriod(period)
    setSnapshotOpen(true)
    setSnapshotDetail(null)
    setSnapshotLoading(true)
    setSnapshotError(null)
    try {
      const detail = await fetchTrendSnapshot(apiBase, selectedId, period, {
        userId: prof?.user_id,
      })
      setSnapshotDetail(detail)
    } catch (e) {
      setSnapshotDetail(null)
      setSnapshotError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setSnapshotLoading(false)
    }
  }

  async function handleDeleteProfile() {
    if (!selectedId || !selectedProfile) return
    const name = profileDisplayName(selectedProfile)
    if (
      !window.confirm(
        `Удалить направление «${name}» вместе со всеми снимками и расписаниями? Это необратимо.`,
      )
    ) {
      return
    }
    setDeletingProfile(true)
    setError(null)
    try {
      await deleteTrendProfile(apiBase, selectedId, { internalKey: getMonthlyInternalKey() })
      setSnapshotOpen(false)
      setSelectedId(null)
      await loadProfiles()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setDeletingProfile(false)
    }
  }

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
            title: 'ИИ-анализ',
            detail:
              'При двух и более снимках LLM-агент формирует сводную интерпретацию динамики по всему ряду; результат кэшируется до появления нового периода.',
          },
          {
            title: 'Лента и метрики',
            detail:
              'KPI, лента изменений (вошли/вышли, Δ цитирований, концепты), графики размера топа и эволюция OpenAlex-концептов.',
          },
          {
            title: 'Настройки направления',
            detail:
              'Имя и заметка — в карточке профиля ниже. Темы поиска, новый снимок и расписание — на странице дайджеста.',
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

      {!loadingList && profiles.length > 0 ? (
        <TrendProfilesOverview
          profiles={profiles}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      ) : null}

      {selectedId ? (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Динамика
              {selectedProfile && profileHasDisplayName(selectedProfile) ? (
                <Badge variant="secondary" className="font-mono font-normal">
                  {selectedProfile.profile_id}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              ИИ-анализ, метрики изменений, графики размера топа и сравнение двух направлений.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingSeries ? (
              <p className="text-sm text-muted-foreground">Загрузка ряда…</p>
            ) : points.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Нет точек для этого профиля.</p>
                <Button type="button" variant="outline" size="sm" className="print:hidden" asChild>
                  <Link to={digestSnapshotHref(selectedId)}>Запустить первый снимок</Link>
                </Button>
              </div>
            ) : (
              <>
                <TrendAnalysisPanel
                  loading={loadingAnalysis && !analysis}
                  error={analysisError}
                  analysis={analysis}
                  snapshotCount={points.length}
                  onRefresh={() => void loadAnalysis(true)}
                  refreshing={refreshingAnalysis}
                />

                <TrendLatestSnapshotPanel latest={highlights?.latest_snapshot} />

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
                  <TrendKpiCards points={points} highlights={highlights?.points} />
                  <TrendActivityFeed points={highlights?.points ?? []} />
                  <TrendConceptEvolutionChart evolution={highlights?.concept_evolution ?? []} />
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
                  <TrendDeltaBarChart points={points} />
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Период</TableHead>
                      <TableHead className="text-right">Работ в топе</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Δ к прошлому</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Δ %</TableHead>
                      <TableHead className="text-right print:hidden">Снимок</TableHead>
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
                        <TableCell className="text-right print:hidden">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => void openSnapshotPeriod(p.period)}
                          >
                            Открыть
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Управление направлением</CardTitle>
          <CardDescription>
            Выбор — в блоке «Обзор направлений» выше. Здесь можно создать новое направление и изменить подпись выбранного.
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
          ) : !selectedId ? (
            <p className="text-sm text-muted-foreground">Выберите направление в обзоре выше.</p>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void loadProfiles()} disabled={loadingList}>
            Обновить список
          </Button>

          {selectedId ? (
            <div className="space-y-5 rounded-lg border border-border/80 bg-muted/15 p-4 print:hidden">
              <div>
                <h3 className="text-sm font-medium">
                  Настройки:{' '}
                  <span className="text-foreground">
                    {selectedProfile
                      ? profileDisplayName(selectedProfile)
                      : selectedId}
                  </span>
                </h3>
                {selectedProfile && profileHasDisplayName(selectedProfile) ? (
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{selectedId}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Темы последнего снимка</p>
                {selectedProfile?.topic_queries?.length ? (
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {selectedProfile.topic_queries.map((q) => (
                      <li key={q} className="break-words">
                        {q}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Снимков ещё не было — темы задаются при первом запуске на странице дайджеста.
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-pretty">
                  Это темы из последнего сохранённого снимка. Новые темы в дайджесте влияют только на следующие
                  запуски; графики ниже не пересчитываются задним числом.
                </p>
                <Button type="button" variant="secondary" size="sm" asChild>
                  <Link to={digestSnapshotHref(selectedId)}>Изменить темы, снимок и расписание</Link>
                </Button>
              </div>

              <form className="space-y-3 border-t border-border/60 pt-4" onSubmit={handleSaveLabel}>
                <p className="text-sm font-medium">Подпись в интерфейсе</p>
                <p className="text-xs text-muted-foreground">
                  Имя и заметка для списка направлений. При проверке служебного ключа на сервере — тот же ключ, что в
                  «Настройки».
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="trend-label-name">Отображаемое имя</Label>
                    <Input
                      id="trend-label-name"
                      value={labelName}
                      onChange={(e) => setLabelName(e.target.value)}
                      placeholder="Например: ВИЭ и сети"
                    />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="trend-label-note">Заметка</Label>
                    <Textarea
                      id="trend-label-note"
                      value={labelNote}
                      onChange={(e) => setLabelNote(e.target.value)}
                      rows={2}
                      placeholder="Опционально"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="sm" disabled={savingLabel || !labelName.trim()}>
                    {savingLabel ? 'Сохранение…' : 'Сохранить подпись'}
                  </Button>
                  {labelMsg ? (
                    <span
                      className={cn(
                        'text-sm',
                        labelMsg === 'Сохранено' ? 'text-muted-foreground' : 'text-destructive',
                      )}
                    >
                      {labelMsg}
                    </span>
                  ) : null}
                </div>
              </form>

              <div className="border-t border-border/60 pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deletingProfile}
                  onClick={() => void handleDeleteProfile()}
                >
                  {deletingProfile ? 'Удаление…' : 'Удалить направление'}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Удаляются все снимки и записи расписания для этого profile_id.
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <TrendSnapshotSheet
        open={snapshotOpen}
        onOpenChange={setSnapshotOpen}
        period={snapshotPeriod}
        detail={snapshotDetail}
        loading={snapshotLoading}
        error={snapshotError}
      />
    </div>
  )
}
