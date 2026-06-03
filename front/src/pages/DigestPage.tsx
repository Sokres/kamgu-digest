import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'

import { DigestOnceExtras } from '@/components/digest/DigestOnceExtras'
import { DigestSchedulePanel } from '@/components/digest/DigestSchedulePanel'
import { DigestSharedParams } from '@/components/digest/DigestSharedParams'
import { DigestSnapshotPanel } from '@/components/digest/DigestSnapshotPanel'
import { DigestResultView } from '@/components/DigestResultView'
import { PageOnboarding } from '@/components/PageOnboarding'
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
import { ApiError, fetchTrendProfiles, saveDigest } from '@/lib/api'
import { DIGEST_TABS, parseDigestTab, type DigestTabId } from '@/lib/digestTabs'
import { getMonthlyInternalKey } from '@/lib/settings'
import type { DigestRequest, DigestResponse, MonthlyDigestResponse, TrendProfileSummary } from '@/types/api'

export function DigestPage() {
  const { apiBase } = useOutletContext<{ apiBase: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseDigestTab(searchParams.get('tab'))
  const form = useDigestFormState()

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
      const internalKey = form.internalKeyField.trim() || getMonthlyInternalKey()
      setProfilesLoading(true)
      try {
        const list = await fetchTrendProfiles(apiBase, { internalKey })
        setTrendProfiles(list)
        const prefer = preferProfileId?.trim()
        form.setSelectedProfileId((prev) => {
          if (prefer && list.some((p) => p.profile_id === prefer)) return prefer
          if (prev && list.some((p) => p.profile_id === prev)) return prev
          return list[0]?.profile_id ?? ''
        })
      } catch {
        setTrendProfiles([])
        form.setSelectedProfileId('')
      } finally {
        setProfilesLoading(false)
      }
    },
    [apiBase, form.internalKeyField, form.setSelectedProfileId]
  )

  useEffect(() => {
    void loadTrendProfilesList()
  }, [loadTrendProfilesList])

  function setTab(tab: DigestTabId) {
    setSearchParams(tab === 'once' ? {} : { tab }, { replace: true })
  }

  function openSaveSheet() {
    const q = form.topicQueriesFromLines()
    const head = q[0]?.slice(0, 60) ?? 'Дайджест'
    setSaveTitle(
      `${new Date().toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} — ${head}`,
    )
    setSaveError(null)
    setSavedId(null)
    setSaveOpen(true)
  }

  async function handleSaveToServer() {
    if (!onceData || !lastRequestSnapshot) return
    const t = saveTitle.trim()
    if (!t) {
      setSaveError('Введите название.')
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    try {
      const created = await saveDigest(apiBase, {
        title: t,
        digest_response: onceData,
        request_snapshot: lastRequestSnapshot,
      })
      setSavedId(created.id)
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
    <div className="mx-auto max-w-4xl space-y-8 pb-8">
      <PageOnboarding
        title="Дайджест литературы"
        steps={[
          {
            title: 'Общие параметры',
            detail: 'Темы, режим источников и лимиты задаются один раз для всех режимов запуска.',
          },
          {
            title: 'Разовый или снимок',
            detail:
              'Разовый — без сохранения в тренды. Снимок — запись в базу и сравнение с прошлым периодом на вкладке «Тренды».',
          },
          {
            title: 'Расписание у направления',
            detail:
              'У каждого направления своё расписание автозапуска снимка — настройка под выбранным профилем на вкладке «Снимок».',
          },
        ]}
      />

      <DigestSharedParams form={form} />

      <Tabs value={activeTab} onValueChange={(v) => setTab(parseDigestTab(v))}>
        <TabsList variant="line" className="w-full max-w-full flex-wrap justify-start gap-1">
          {DIGEST_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="px-3">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

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
                <Button type="button" variant="secondary" size="sm" className="print:hidden" onClick={openSaveSheet}>
                  Сохранить в архив
                </Button>
              ) : null}
            </div>
            {!onceLoading && !onceData && !onceError ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-3 text-sm text-muted-foreground print:hidden">
                Здесь появится дайджест RU/EN после запуска на вкладке «Разовый».
              </p>
            ) : null}
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
          />
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Результат</h2>
              <p className="mt-1 text-xs text-muted-foreground/90">Дайджест, метаданные и структурированные тренды</p>
            </div>
            {!snapLoading && !snapData && !snapError ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-3 text-sm text-muted-foreground print:hidden">
                После запуска снимка — дайджест RU/EN и блок изменений относительно прошлого периода.
              </p>
            ) : null}
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
            <Button type="button" disabled={saveBusy || !!savedId} onClick={() => void handleSaveToServer()}>
              {saveBusy ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
