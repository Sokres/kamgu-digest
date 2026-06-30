import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'

import { DigestOnceExtras } from '@/components/digest/DigestOnceExtras'
import { DigestSchedulePanel } from '@/components/digest/DigestSchedulePanel'
import { DigestSharedParams } from '@/components/digest/DigestSharedParams'
import { DigestSnapshotPanel } from '@/components/digest/DigestSnapshotPanel'
import { DigestResultView } from '@/components/DigestResultView'
import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDigestFormState } from '@/hooks/useDigestFormState'
import { useDigestSchedules } from '@/hooks/useDigestSchedules'
import { ApiError, fetchTrendProfiles, saveDigest } from '@/lib/api'
import { DIGEST_TABS, parseDigestTab, type DigestTabId } from '@/lib/digestTabs'
import { getMonthlyInternalKey } from '@/lib/settings'
import type { DigestRequest, DigestResponse, MonthlyDigestResponse, TrendProfileSummary } from '@/types/api'

function DigestAhaPanel({ data }: { data: DigestResponse | MonthlyDigestResponse }) {
  const meta = data.meta
  const sourceCount =
    meta?.digest_mode === 'web_snippets'
      ? meta.web_snippets_used
      : (meta?.after_dedupe ??
        [meta?.candidates_openalex, meta?.candidates_semantic_scholar, meta?.candidates_core]
          .filter((v): v is number => typeof v === 'number')
          .reduce((sum, v) => sum + v, 0))
  const selectedCount = meta?.used_for_llm ?? data.publications_used.length
  const cardCount = data.article_cards.length

  const items = [
    { label: 'найдено', value: sourceCount ?? '—' },
    { label: 'выбрано для LLM', value: selectedCount || '—' },
    { label: 'карточек статей', value: cardCount || '—' },
    { label: 'дайджест', value: 'RU / EN' },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border/75 bg-card/90 p-4 shadow-sm">
          <div className="text-2xl font-semibold tracking-tight text-foreground">{item.value}</div>
          <div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

type DigestPageProps = {
  forcedTab?: DigestTabId
}

export function DigestPage({ forcedTab }: DigestPageProps) {
  const { apiBase } = useOutletContext<{ apiBase: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = forcedTab ?? parseDigestTab(searchParams.get('tab'))
  const showModeTabs = forcedTab == null
  const form = useDigestFormState()
  const { internalKeyField, setSelectedProfileId } = form
  const schedules = useDigestSchedules(apiBase, form.internalKeyField)

  const [trendProfiles, setTrendProfiles] = useState<TrendProfileSummary[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)

  const [onceLoading, setOnceLoading] = useState(false)
  const [onceData, setOnceData] = useState<DigestResponse | null>(null)
  const [onceError, setOnceError] = useState<string | null>(null)
  const [lastRequestSnapshot, setLastRequestSnapshot] = useState<DigestRequest | null>(null)

  const [snapLoading, setSnapLoading] = useState(false)
  const [snapData, setSnapData] = useState<MonthlyDigestResponse | null>(null)
  const [snapError, setSnapError] = useState<string | null>(null)

  const [saveOpen, setSaveOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const loadTrendProfilesList = useCallback(
    async (preferProfileId?: string) => {
      const internalKey = internalKeyField.trim() || getMonthlyInternalKey()
      setProfilesLoading(true)
      try {
        const list = await fetchTrendProfiles(apiBase, { internalKey })
        setTrendProfiles(list)
        const prefer = preferProfileId?.trim()
        setSelectedProfileId((prev) => {
          if (prefer && list.some((p) => p.profile_id === prefer)) return prefer
          if (prev && list.some((p) => p.profile_id === prev)) return prev
          return list[0]?.profile_id ?? ''
        })
      } catch {
        setTrendProfiles([])
        setSelectedProfileId('')
      } finally {
        setProfilesLoading(false)
      }
    },
    [apiBase, internalKeyField, setSelectedProfileId]
  )

  useEffect(() => {
    const profileFromUrl = searchParams.get('profile')?.trim()
    void loadTrendProfilesList(profileFromUrl || undefined)
  }, [loadTrendProfilesList, searchParams])

  function setTab(tab: DigestTabId) {
    setSearchParams(tab === 'once' ? {} : { tab }, { replace: true })
  }

  function openSaveSheet(mode: 'once' | 'snapshot') {
    const q = form.topicQueriesFromLines()
    const head = q[0]?.slice(0, 60) ?? 'Дайджест'
    const period = snapData?.meta?.period
    const prefix =
      mode === 'snapshot' && period
        ? `Снимок ${period}`
        : new Date().toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
    setSaveTitle(`${prefix} — ${head}`)
    setSaveError(null)
    setSavedId(null)
    setSaveOpen(true)
  }

  async function handleSaveToServer() {
    const t = saveTitle.trim()
    if (!t) {
      setSaveError('Введите название.')
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    try {
      if (activeTab === 'snapshot' && snapData) {
        const built = form.buildMonthlyRequest(form.selectedProfileId)
        if (!built.ok) {
          setSaveError(built.message)
          return
        }
        const created = await saveDigest(apiBase, {
          title: t,
          monthly_digest: snapData,
          monthly_request_snapshot: built.body,
        })
        setSavedId(created.id)
      } else if (onceData && lastRequestSnapshot) {
        const created = await saveDigest(apiBase, {
          title: t,
          digest_response: onceData,
          request_snapshot: lastRequestSnapshot,
        })
        setSavedId(created.id)
      } else {
        setSaveError('Нет данных для сохранения.')
      }
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setSaveBusy(false)
    }
  }

  function handleOnceResult(data: DigestResponse | null, request: DigestRequest | null, error: string | null) {
    setOnceData(data)
    setLastRequestSnapshot(request)
    setOnceError(error)
  }

  function handleSnapResult(data: MonthlyDigestResponse | null, error: string | null) {
    setSnapData(data)
    setSnapError(error)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-8">
      <DigestSharedParams
        form={form}
        eyebrow={activeTab === 'snapshot' ? 'Monitoring setup' : undefined}
        title={activeTab === 'snapshot' ? 'Что мониторим?' : undefined}
        description={
          activeTab === 'snapshot'
            ? 'Задайте тему для следующего снимка направления, сохраните период и настройте автозапуск.'
            : undefined
        }
        topicLabel={activeTab === 'snapshot' ? 'Тема мониторинга' : undefined}
      />

      <Tabs value={activeTab} onValueChange={(v) => setTab(parseDigestTab(v))}>
        {showModeTabs ? (
          <TabsList variant="line" className="w-full max-w-full flex-wrap justify-start gap-1">
            {DIGEST_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}

        <TabsContent value="once" className="mt-6 space-y-8">
          <DigestOnceExtras
            apiBase={apiBase}
            form={form}
            loading={onceLoading}
            setLoading={setOnceLoading}
            onResult={handleOnceResult}
          />
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Результат</h2>
                <p className="mt-1 text-xs text-muted-foreground/90">Текст дайджеста и карточки источников</p>
              </div>
              {onceData && !onceLoading ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="print:hidden"
                  onClick={() => openSaveSheet('once')}
                >
                  Сохранить в архив
                </Button>
              ) : null}
            </div>
            {!onceLoading && !onceData && !onceError ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-3 text-sm text-muted-foreground print:hidden">
                Здесь появятся ключевые цифры, RU/EN дайджест и карточки публикаций.
              </p>
            ) : null}
            {onceData && !onceLoading ? <DigestAhaPanel data={onceData} /> : null}
            <DigestResultView
              loading={onceLoading}
              loadingHint={
                onceLoading
                  ? 'Идёт сбор публикаций и вызов LLM — оставьте страницу открытой.'
                  : undefined
              }
              error={onceError && !onceData ? onceError : null}
              data={onceData}
            />
          </section>
        </TabsContent>

        <TabsContent value="snapshot" className="mt-6 space-y-8">
          <DigestSnapshotPanel
            apiBase={apiBase}
            form={form}
            trendProfiles={trendProfiles}
            profilesLoading={profilesLoading}
            onRefreshProfiles={(id) => void loadTrendProfilesList(id)}
            loading={snapLoading}
            setLoading={setSnapLoading}
            onResult={handleSnapResult}
          />
          <DigestSchedulePanel
            apiBase={apiBase}
            form={form}
            trendProfiles={trendProfiles}
            profileId={form.selectedProfileId}
            digestSchedules={schedules.digestSchedules}
            schedulesLoading={schedules.loading}
            schedulesError={schedules.error}
            setSchedulesError={schedules.setError}
            onReloadSchedules={schedules.reload}
            scheduleInternalKey={schedules.scheduleInternalKey}
          />
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Результат</h2>
                <p className="mt-1 text-xs text-muted-foreground/90">Дайджест, метаданные и структурированные тренды</p>
              </div>
              {snapData && !snapLoading ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="print:hidden"
                  onClick={() => openSaveSheet('snapshot')}
                >
                  Сохранить в архив
                </Button>
              ) : null}
            </div>
            {!snapLoading && !snapData && !snapError ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-3 text-sm text-muted-foreground print:hidden">
                После запуска снимка — дайджест RU/EN и блок изменений относительно прошлого периода.
              </p>
            ) : null}
            {snapData && !snapLoading ? <DigestAhaPanel data={snapData} /> : null}
            <DigestResultView
              loading={snapLoading}
              loadingHint={
                snapLoading
                  ? 'Снимок и сравнение с предыдущим периодом — ориентир 5–15 минут. Не закрывайте вкладку.'
                  : undefined
              }
              error={snapError && !snapData ? snapError : null}
              data={snapData ?? undefined}
            />
            {snapData?.structured_delta ? (
              <div className="mt-10 space-y-4">
                <h3 className="text-lg font-heading font-medium">Структурированные тренды</h3>
                <StructuredDeltaView delta={snapData.structured_delta} />
              </div>
            ) : null}
          </section>
        </TabsContent>
      </Tabs>

      <Sheet open={saveOpen} onOpenChange={setSaveOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Сохранить в архив</SheetTitle>
            <SheetDescription>
              Запись будет доступна в разделе «Сохранённые».
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="save-title">Название</Label>
              <Input
                id="save-title"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="Краткая подпись"
              />
            </div>
            {saveError ? (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            ) : null}
            {savedId ? (
              <Alert>
                <AlertTitle>Сохранено</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span>Можно открыть в архиве.</span>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link to={`/saved/${savedId}`}>Открыть</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <SheetFooter className="mt-auto gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              Закрыть
            </Button>
            <Button
              type="button"
              disabled={saveBusy || !!savedId || (activeTab === 'snapshot' ? !snapData : !onceData)}
              onClick={() => void handleSaveToServer()}
            >
              {saveBusy ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
