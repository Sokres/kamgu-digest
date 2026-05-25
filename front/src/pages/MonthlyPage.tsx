import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { DigestResultView } from '@/components/DigestResultView'
import { PageOnboarding } from '@/components/PageOnboarding'
import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  ApiError,
  createDigestSchedule,
  createMonthlyDigest,
  createTrendProfile,
  deleteDigestSchedule,
  fetchDigestSchedules,
  fetchScheduleRuns,
  fetchTrendProfiles,
  patchDigestSchedule,
} from '@/lib/api'
import { getMonthlyInternalKey } from '@/lib/settings'
import type {
  DigestMode,
  DigestScheduleRunOut,
  DigestSchedulesListResponse,
  MonthlyDigestRequest,
  MonthlyDigestResponse,
  TrendProfileSummary,
} from '@/types/api'

function parseYear(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function parseDois(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseWebExtraTerms(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const CRON_PRESETS: { id: string; label: string; cron: string }[] = [
  { id: 'monthly', label: '1-е число, 06:00 UTC', cron: '0 6 1 * *' },
  { id: 'quarter', label: '1-е число квартала, 06:00 UTC', cron: '0 6 1 1,4,7,10 *' },
  { id: 'weekly', label: 'Понедельник, 06:00 UTC', cron: '0 6 * * 1' },
  { id: 'daily', label: 'Каждый день, 06:00 UTC', cron: '0 6 * * *' },
  { id: 'custom', label: 'Свой crontab (UTC)', cron: '' },
]

export function MonthlyPage() {
  const { apiBase } = useOutletContext<{ apiBase: string }>()
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [trendProfiles, setTrendProfiles] = useState<TrendProfileSummary[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [digestMode, setDigestMode] = useState<DigestMode>('peer_reviewed')
  const [webScholarlyOnly, setWebScholarlyOnly] = useState(true)
  const [webExtraTerms, setWebExtraTerms] = useState('')
  const [fetchOaFulltext, setFetchOaFulltext] = useState(false)
  const [deepDigest, setDeepDigest] = useState(false)
  const [topics, setTopics] = useState<string[]>([''])
  const [maxCandidates, setMaxCandidates] = useState('100')
  const [topN, setTopN] = useState('20')
  const [trendTopK, setTrendTopK] = useState('20')
  const [fromYear, setFromYear] = useState('')
  const [toYear, setToYear] = useState('')
  const [excludeDois, setExcludeDois] = useState('')
  const [forcePeriod, setForcePeriod] = useState('')
  const [internalKeyField, setInternalKeyField] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MonthlyDigestResponse | null>(null)

  const [digestSchedules, setDigestSchedules] = useState<DigestSchedulesListResponse | null>(null)
  const [schedulesLoading, setSchedulesLoading] = useState(false)
  const [schedulesError, setSchedulesError] = useState<string | null>(null)
  const [schSubmitting, setSchSubmitting] = useState(false)
  const [schProfileId, setSchProfileId] = useState('')
  const [schCron, setSchCron] = useState('0 6 1 * *')
  const [schPreset, setSchPreset] = useState('monthly')
  const [schTopicText, setSchTopicText] = useState('')
  const [runsPanelScheduleId, setRunsPanelScheduleId] = useState<string | null>(null)
  const [runsRows, setRunsRows] = useState<DigestScheduleRunOut[] | null>(null)
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)

  const internalKeyRef = useRef(internalKeyField)
  internalKeyRef.current = internalKeyField

  const loadSchedulesList = useCallback(async () => {
    const internalKey = internalKeyRef.current.trim() || getMonthlyInternalKey()
    setSchedulesLoading(true)
    setSchedulesError(null)
    try {
      const res = await fetchDigestSchedules(apiBase, { internalKey })
      setDigestSchedules(res)
    } catch (err) {
      setDigestSchedules(null)
      if (err instanceof ApiError) {
        setSchedulesError(err.message)
      } else {
        setSchedulesError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSchedulesLoading(false)
    }
  }, [apiBase])

  const loadTrendProfilesList = useCallback(async () => {
    const internalKey = internalKeyRef.current.trim() || getMonthlyInternalKey()
    setProfilesLoading(true)
    try {
      const list = await fetchTrendProfiles(apiBase, { internalKey })
      setTrendProfiles(list)
      setSelectedProfileId((prev) => {
        if (prev && list.some((p) => p.profile_id === prev)) return prev
        return list[0]?.profile_id ?? ''
      })
    } catch {
      setTrendProfiles([])
    } finally {
      setProfilesLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    void loadSchedulesList()
  }, [loadSchedulesList])

  useEffect(() => {
    void loadTrendProfilesList()
  }, [loadTrendProfilesList])

  async function handleCreateProfile() {
    const name = newProfileName.trim()
    setError(null)
    if (!name) {
      setError('Введите название нового направления.')
      return
    }
    const internalKey = internalKeyField.trim() || getMonthlyInternalKey()
    setCreatingProfile(true)
    try {
      const res = await createTrendProfile(apiBase, { display_name: name }, { internalKey })
      setNewProfileName('')
      await loadTrendProfilesList()
      setSelectedProfileId(res.profile_id)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setCreatingProfile(false)
    }
  }

  function addTopic() {
    setTopics((t) => [...t, ''])
  }

  function setTopic(i: number, v: string) {
    setTopics((t) => t.map((x, j) => (j === i ? v : x)))
  }

  function removeTopic(i: number) {
    setTopics((t) => t.filter((_, j) => j !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const queries = topics.map((s) => s.trim()).filter(Boolean)
    if (!queries.length) {
      setError('Добавьте хотя бы одну поисковую строку.')
      return
    }
    const pid = selectedProfileId.trim()
    if (!pid) {
      setError('Выберите направление или создайте новое (название и кнопка «Создать»).')
      return
    }
    const mc = Number.parseInt(maxCandidates, 10)
    const tn = Number.parseInt(topN, 10)
    const tk = Number.parseInt(trendTopK, 10)
    if (!Number.isFinite(mc) || mc < 10 || mc > 200) {
      setError('max_candidates: число от 10 до 200')
      return
    }
    if (!Number.isFinite(tn) || tn < 3 || tn > 40) {
      setError('top_n_for_llm: число от 3 до 40')
      return
    }
    if (!Number.isFinite(tk) || tk < 5 || tk > 60) {
      setError('trend_top_k: число от 5 до 60')
      return
    }

    const fp = forcePeriod.trim()
    const extras = parseWebExtraTerms(webExtraTerms)
    const body: MonthlyDigestRequest = {
      profile_id: pid,
      topic_queries: queries,
      digest_mode: digestMode,
      max_candidates: mc,
      top_n_for_llm: tn,
      trend_top_k: tk,
      from_year: parseYear(fromYear),
      to_year: parseYear(toYear),
      exclude_dois: parseDois(excludeDois),
      force_period: fp ? fp : null,
      fetch_oa_fulltext: fetchOaFulltext,
      deep_digest: deepDigest,
    }
    if (digestMode === 'web_snippets') {
      body.web_scholarly_sources_only = webScholarlyOnly
      if (extras.length) body.web_search_additional_terms = extras
    }

    const keyOverride = internalKeyField.trim()
    const internalKey = keyOverride || getMonthlyInternalKey()

    setLoading(true)
    setData(null)
    try {
      const res = await createMonthlyDigest(apiBase, body, { internalKey })
      setData(res)
    } catch (err) {
      setData(null)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setLoading(false)
    }
  }

  function scheduleInternalKey() {
    return internalKeyField.trim() || getMonthlyInternalKey()
  }

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSchedulesError(null)
    const queries = schTopicText.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    if (!queries.length) {
      setSchedulesError('В расписании укажите хотя бы одну тему (по строке).')
      return
    }
    const pid = schProfileId.trim() || selectedProfileId.trim()
    if (!pid) {
      setSchedulesError('Выберите направление в форме выше или введите UUID профиля для расписания.')
      return
    }
    const mc = Number.parseInt(maxCandidates, 10)
    const tn = Number.parseInt(topN, 10)
    const tk = Number.parseInt(trendTopK, 10)
    if (!Number.isFinite(mc) || mc < 10 || mc > 200) {
      setSchedulesError('max_candidates: число от 10 до 200')
      return
    }
    if (!Number.isFinite(tn) || tn < 3 || tn > 40) {
      setSchedulesError('top_n_for_llm: число от 3 до 40')
      return
    }
    if (!Number.isFinite(tk) || tk < 5 || tk > 60) {
      setSchedulesError('trend_top_k: число от 5 до 60')
      return
    }
    const cron = schCron.trim()
    if (!cron) {
      setSchedulesError('Укажите crontab (5 полей, UTC).')
      return
    }
    setSchSubmitting(true)
    try {
      await createDigestSchedule(
        apiBase,
        {
          profile_id: pid,
          cron_utc: cron,
          enabled: true,
          topic_queries: queries,
          digest_mode: digestMode,
          web_scholarly_sources_only: digestMode === 'web_snippets' ? webScholarlyOnly : undefined,
          web_search_additional_terms:
            digestMode === 'web_snippets' && parseWebExtraTerms(webExtraTerms).length
              ? parseWebExtraTerms(webExtraTerms)
              : undefined,
          max_candidates: mc,
          top_n_for_llm: tn,
          trend_top_k: tk,
          from_year: parseYear(fromYear),
          to_year: parseYear(toYear),
          exclude_dois: parseDois(excludeDois),
          fetch_oa_fulltext: fetchOaFulltext,
          deep_digest: deepDigest,
        },
        { internalKey: scheduleInternalKey() },
      )
      await loadSchedulesList()
    } catch (err) {
      if (err instanceof ApiError) {
        setSchedulesError(err.message)
      } else {
        setSchedulesError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSchSubmitting(false)
    }
  }

  async function handleToggleSchedule(id: string, enabled: boolean) {
    setSchedulesError(null)
    try {
      await patchDigestSchedule(apiBase, id, { enabled: !enabled }, { internalKey: scheduleInternalKey() })
      await loadSchedulesList()
    } catch (err) {
      if (err instanceof ApiError) {
        setSchedulesError(err.message)
      } else {
        setSchedulesError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  async function handleDeleteSchedule(id: string) {
    if (!window.confirm('Удалить это расписание?')) return
    setSchedulesError(null)
    try {
      await deleteDigestSchedule(apiBase, id, { internalKey: scheduleInternalKey() })
      await loadSchedulesList()
    } catch (err) {
      if (err instanceof ApiError) {
        setSchedulesError(err.message)
      } else {
        setSchedulesError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  async function toggleScheduleRuns(sid: string) {
    if (runsPanelScheduleId === sid) {
      setRunsPanelScheduleId(null)
      return
    }
    setRunsPanelScheduleId(sid)
    setRunsLoading(true)
    setRunsError(null)
    setRunsRows(null)
    try {
      const rows = await fetchScheduleRuns(apiBase, sid, { internalKey: scheduleInternalKey() })
      setRunsRows(rows)
    } catch (err) {
      setRunsError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setRunsLoading(false)
    }
  }

  const meta = data?.meta

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-8">
      <PageOnboarding
        title="Периодический режим: снимок и сравнение"
        steps={[
          {
            title: 'Профиль и темы',
            detail:
              'Создайте направление с понятным названием (получите UUID автоматически) и задайте темы поиска — те же настройки можно использовать в расписании.',
          },
          {
            title: 'Расписание',
            detail:
              'Ниже можно настроить автозапуск, если это включено на вашем сервере, либо подключить внешнее расписание (например cron у администратора).',
          },
          {
            title: 'Снимок и тренды',
            detail:
              'После успешного запуска доступны сравнение с прошлым периодом и графики на странице «Тренды».',
          },
        ]}
      />

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Периодический дайджест с трендами</CardTitle>
          <CardDescription className="text-pretty">
            Разовый запуск: снимок в базе, сравнение с прошлым периодом и текст дайджеста (обычно 5–15 минут).
            Повторять запуск можно по расписанию ниже или внешним планировщиком. Если администратор включил проверку
            сервисного ключа — укажите его в настройках или в поле ниже.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-[220px] flex-1 gap-2">
                  <Label htmlFor="profile-select">Направление</Label>
                  <Select
                    value={selectedProfileId || undefined}
                    onValueChange={(v) => setSelectedProfileId(v)}
                  >
                    <SelectTrigger id="profile-select" className="w-full">
                      <SelectValue placeholder={trendProfiles.length ? 'Выберите направление' : 'Нет направлений — создайте ниже'} />
                    </SelectTrigger>
                    <SelectContent>
                      {trendProfiles.map((p) => (
                        <SelectItem key={p.profile_id} value={p.profile_id}>
                          {(p.display_name ?? '').trim() || p.profile_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={profilesLoading}
                  onClick={() => void loadTrendProfilesList()}
                >
                  {profilesLoading ? '…' : 'Обновить список'}
                </Button>
              </div>
              {selectedProfileId ? (
                <p className="break-all font-mono text-xs text-muted-foreground">
                  Технический id (UUID): {selectedProfileId}
                </p>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-[200px] flex-1 gap-2">
                  <Label htmlFor="new-prof-name">Новое направление</Label>
                  <Input
                    id="new-prof-name"
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
              <p className="text-xs text-muted-foreground">
                Одно направление — одна линия на графиках «Тренды»; внутри сервера ему соответствует стабильный UUID.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Поисковые строки (RU/EN)</Label>
              {topics.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={t}
                    onChange={(e) => setTopic(i, e.target.value)}
                    placeholder="Тема"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeTopic(i)}
                    disabled={topics.length <= 1}
                    aria-label="Удалить строку"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addTopic}>
                Добавить строку
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthly-digest-mode">Режим источников</Label>
              <Select
                value={digestMode}
                onValueChange={(v) => setDigestMode(v as DigestMode)}
              >
                <SelectTrigger id="monthly-digest-mode" className="h-auto min-h-10 w-full max-w-xl py-2 whitespace-normal">
                  <SelectValue placeholder="Режим" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peer_reviewed">Рецензируемый корпус (OpenAlex и др.)</SelectItem>
                  <SelectItem value="web_snippets">Веб-обзор по сниппетам (Tavily)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {digestMode === 'web_snippets' ? (
              <>
                <Alert className="border-primary/25 bg-primary/5">
                  <AlertTitle>Веб-обзор в периодическом режиме</AlertTitle>
                  <AlertDescription>
                    Как и в разовом дайджесте: короткие сниппеты через Tavily и отдельный дисклеймер. Снимки и сравнение
                    трендов строятся по стабильным URL сниппетов. На стороне сервера должен быть ключ Tavily.
                  </AlertDescription>
                </Alert>
                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/15 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="monthly-web-scholarly" className="text-sm font-medium">
                        Только научные сайты
                      </Label>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        По умолчанию Tavily ограничен академическими доменами; отключите для поиска по всей сети.
                      </p>
                    </div>
                    <Switch
                      id="monthly-web-scholarly"
                      checked={webScholarlyOnly}
                      onCheckedChange={setWebScholarlyOnly}
                      className="shrink-0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthly-web-extra">Дополнительные ключевые слова (через запятую)</Label>
                    <Input
                      id="monthly-web-extra"
                      value={webExtraTerms}
                      onChange={(e) => setWebExtraTerms(e.target.value)}
                      placeholder="например: battery, review"
                    />
                  </div>
                </div>
              </>
            ) : null}

            {digestMode === 'peer_reviewed' ? (
              <div className="space-y-4 rounded-lg border border-border/80 bg-muted/15 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="monthly-fetch-oa"
                    checked={fetchOaFulltext}
                    onCheckedChange={(c) => setFetchOaFulltext(c === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="monthly-fetch-oa" className="cursor-pointer text-sm font-medium leading-snug">
                      OA-полнотекст по DOI (Unpaywall)
                    </Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Для открытых статей подтягивается текст PDF для модели. В веб-режиме опция не используется.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/15 p-4">
              <Checkbox
                id="monthly-deep"
                checked={deepDigest}
                onCheckedChange={(c) => setDeepDigest(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="monthly-deep" className="cursor-pointer text-sm font-medium leading-snug">
                  Глубокий дайджест (двухэтапный LLM)
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Принудительно два этапа: кратко по каждому источнику, затем сводка. Дольше и больше вызовов к модели.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="max-c">Макс. кандидатов (10–200)</Label>
                <Input
                  id="max-c"
                  type="number"
                  min={10}
                  max={200}
                  value={maxCandidates}
                  onChange={(e) => setMaxCandidates(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="top-n">Статей для модели (3–40)</Label>
                <Input
                  id="top-n"
                  type="number"
                  min={3}
                  max={40}
                  value={topN}
                  onChange={(e) => setTopN(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trend-k">Размер топа для трендов (5–60)</Label>
                <Input
                  id="trend-k"
                  type="number"
                  min={5}
                  max={60}
                  value={trendTopK}
                  onChange={(e) => setTrendTopK(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="from-y">Год от</Label>
                <Input
                  id="from-y"
                  type="number"
                  min={1900}
                  max={2100}
                  value={fromYear}
                  onChange={(e) => setFromYear(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-y">Год до</Label>
                <Input
                  id="to-y"
                  type="number"
                  min={1900}
                  max={2100}
                  value={toYear}
                  onChange={(e) => setToYear(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="force">Период снимка (YYYY-MM, необязательно)</Label>
              <Input
                id="force"
                value={forcePeriod}
                onChange={(e) => setForcePeriod(e.target.value)}
                placeholder="2025-03 — переопределить период снимка"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exclude">Исключить DOI</Label>
              <Textarea
                id="exclude"
                value={excludeDois}
                onChange={(e) => setExcludeDois(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="x-int">Сервисный ключ (если нужен; иначе — из «Настройки»)</Label>
              <Input
                id="x-int"
                value={internalKeyField}
                onChange={(e) => setInternalKeyField(e.target.value)}
                placeholder="оставьте пустым — возьмём из настроек"
                autoComplete="off"
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={loading} size="lg" className="min-w-[240px]">
              {loading ? 'Формирование…' : 'Запустить периодический дайджест'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Расписание (встроенный планировщик)</CardTitle>
              <CardDescription className="text-pretty mt-1 max-w-2xl">
                Автозапуск по времени, если эта возможность включена на сервере. Время задаётся в{' '}
                <span className="whitespace-nowrap">UTC</span>, формат cron — пять полей: минута, час, день, месяц, день
                недели.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={schedulesLoading} onClick={() => void loadSchedulesList()}>
              {schedulesLoading ? 'Загрузка…' : 'Обновить список'}
            </Button>
          </div>
          {digestSchedules ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant={digestSchedules.scheduler_enabled_in_config ? 'default' : 'secondary'}>
                настройка сервера: {digestSchedules.scheduler_enabled_in_config ? 'вкл' : 'выкл'}
              </Badge>
              <Badge variant={digestSchedules.scheduler_running ? 'default' : 'outline'}>
                процесс: {digestSchedules.scheduler_running ? 'запущен' : 'не запущен'}
              </Badge>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {schedulesError ? (
            <Alert variant="destructive">
              <AlertDescription>{schedulesError}</AlertDescription>
            </Alert>
          ) : null}

          {digestSchedules && digestSchedules.items.length > 0 ? (
            <ul className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-3 text-sm">
              {digestSchedules.items.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="font-medium truncate">
                        {s.profile_id}{' '}
                        <span className="text-muted-foreground font-normal">· {s.cron_utc}</span>{' '}
                        <Badge variant="outline" className="ml-1 align-middle text-[10px] font-normal">
                          {s.digest_mode === 'web_snippets' ? 'веб' : 'реценз.'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground break-all">
                        {s.topic_queries.join(' · ')}
                      </div>
                      {s.last_run_at ? (
                        <div className="text-xs text-muted-foreground">
                          Последний запуск: {s.last_run_at}
                          {s.last_status ? ` · ${s.last_status}` : ''}
                          {s.last_error ? ` — ${s.last_error}` : ''}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Ещё не запускалось по расписанию</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void toggleScheduleRuns(s.id)}
                      >
                        {runsPanelScheduleId === s.id ? 'Скрыть журнал' : 'Журнал запусков'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleToggleSchedule(s.id, s.enabled)}
                      >
                        {s.enabled ? 'Отключить' : 'Включить'}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void handleDeleteSchedule(s.id)}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>
                  {runsPanelScheduleId === s.id ? (
                    <div className="rounded-md border border-border/60 bg-background p-3">
                      {runsLoading ? (
                        <p className="text-xs text-muted-foreground">Загрузка журнала…</p>
                      ) : null}
                      {runsError ? (
                        <Alert variant="destructive" className="mb-2 py-2">
                          <AlertDescription>{runsError}</AlertDescription>
                        </Alert>
                      ) : null}
                      {!runsLoading && runsRows && runsRows.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Записей пока нет (после обновления сервера).</p>
                      ) : null}
                      {runsRows && runsRows.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[180px]">Время</TableHead>
                              <TableHead>Статус</TableHead>
                              <TableHead>Сообщение</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {runsRows.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell className="font-mono text-xs align-top">{r.finished_at}</TableCell>
                                <TableCell className="align-top text-xs">{r.status}</TableCell>
                                <TableCell className="max-w-[min(480px,70vw)] break-words text-xs align-top">
                                  {r.message || '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : !schedulesLoading ? (
            <p className="text-sm text-muted-foreground">Пока нет записей расписания.</p>
          ) : null}

          <form onSubmit={handleCreateSchedule} className="space-y-4 border-t border-border/60 pt-6">
            <h3 className="text-sm font-medium">Добавить расписание</h3>
            <p className="text-xs text-muted-foreground">
              Параметры выборки (режим, лимиты, годы, исключения DOI, глубина LLM) берутся из формы «Периодический
              дайджест» выше. Для запуска по расписанию с другим режимом сначала переключите режим в форме, затем
              сохраните расписание.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sch-profile">Другой профиль (UUID, по желанию)</Label>
                <Input
                  id="sch-profile"
                  value={schProfileId}
                  onChange={(e) => setSchProfileId(e.target.value)}
                  placeholder="пусто — используется направление из формы выше"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sch-preset">Шаблон времени (UTC)</Label>
                <select
                  id="sch-preset"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={schPreset}
                  onChange={(e) => {
                    const id = e.target.value
                    setSchPreset(id)
                    const p = CRON_PRESETS.find((x) => x.id === id)
                    if (p?.cron) setSchCron(p.cron)
                  }}
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-cron">Расписание (cron, UTC)</Label>
              <Input
                id="sch-cron"
                value={schCron}
                onChange={(e) => {
                  setSchCron(e.target.value)
                  setSchPreset('custom')
                }}
                placeholder="0 6 1 * *"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="sch-topics">Темы (по одной строке)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSchTopicText(topics.filter((t) => t.trim()).join('\n'))}
                >
                  Взять из формы выше
                </Button>
              </div>
              <Textarea
                id="sch-topics"
                value={schTopicText}
                onChange={(e) => setSchTopicText(e.target.value)}
                rows={3}
              />
            </div>
            <Button type="submit" disabled={schSubmitting} variant="secondary">
              {schSubmitting ? 'Сохранение…' : 'Сохранить расписание'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Результат</h2>
          <p className="mt-1 text-xs text-muted-foreground/90">Дайджест, метаданные и структурированные тренды</p>
        </div>
        {!loading && !data && !error ? (
          <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-3 text-sm text-muted-foreground print:hidden">
            После запуска здесь будет дайджест RU/EN, мета периода и блок структурированных изменений относительно
            предыдущего сохранённого снимка.
          </p>
        ) : null}
        {data && meta ? (
          <div className="flex flex-wrap gap-2 mb-4">
            {meta.profile_id ? (
              <Badge variant="secondary">Профиль: {meta.profile_id}</Badge>
            ) : null}
            {meta.period ? <Badge variant="outline">период: {meta.period}</Badge> : null}
            {meta.compared_period != null && meta.compared_period !== '' ? (
              <Badge variant="outline">сравнение с: {meta.compared_period}</Badge>
            ) : null}
            {meta.snapshot_saved != null ? (
              <Badge variant={meta.snapshot_saved ? 'default' : 'secondary'}>
                снимок: {meta.snapshot_saved ? 'сохранён' : 'не сохранён'}
              </Badge>
            ) : null}
          </div>
        ) : null}
        <DigestResultView
          loading={loading}
          loadingHint={
            loading
              ? 'Снимок и сравнение с предыдущим периодом плюс LLM — ориентир 5–15 минут. Не закрывайте вкладку.'
              : undefined
          }
          error={error && !data ? error : null}
          data={data ?? undefined}
        />
        {data?.structured_delta ? (
          <div className="mt-10 space-y-4">
            <h3 className="text-lg font-heading font-medium">Структурированные тренды</h3>
            <StructuredDeltaView delta={data.structured_delta} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
