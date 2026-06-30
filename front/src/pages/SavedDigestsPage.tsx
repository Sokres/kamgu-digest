import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { DigestResultView } from '@/components/DigestResultView'
import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ApiError, createSavedDigestShare, deleteSavedDigest, deleteSavedDigestShare, downloadSavedDigestDocx, getSavedDigest, listSavedDigests } from '@/lib/api'
import { copyTextToClipboard } from '@/lib/digestExport'
import type { SavedDigestListItem, SavedDigestOut } from '@/types/api'

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function dayGroupLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Ранее'
  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((startToday - startDate) / 86_400_000)
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  return date.toLocaleDateString('ru-RU', { month: 'long', day: 'numeric' })
}

function digestModeLabel(mode?: string) {
  return mode === 'web_snippets' ? 'Web' : 'Статьи'
}

export function SavedDigestsPage() {
  const { apiBase } = useOutletContext<{ apiBase: string }>()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [items, setItems] = useState<SavedDigestListItem[] | null>(null)
  const [detail, setDetail] = useState<SavedDigestOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [docxBusy, setDocxBusy] = useState(false)
  const [query, setQuery] = useState('')

  const loadList = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const list = await listSavedDigests(apiBase)
      setItems(list)
    } catch (e) {
      setItems([])
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  const loadDetail = useCallback(async () => {
    if (!id) return
    setError(null)
    setLoading(true)
    try {
      const d = await getSavedDigest(apiBase, id)
      setDetail(d)
    } catch (e) {
      setDetail(null)
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setLoading(false)
    }
  }, [apiBase, id])

  useEffect(() => {
    if (id) {
      void loadDetail()
    } else {
      setDetail(null)
      void loadList()
    }
  }, [id, loadDetail, loadList])

  async function handleDelete(itemId: string) {
    if (!window.confirm('Удалить этот сохранённый дайджест?')) return
    setDeletingId(itemId)
    setError(null)
    try {
      await deleteSavedDigest(apiBase, itemId)
      if (id === itemId) {
        navigate('/saved', { replace: true })
        return
      }
      setItems((prev) => (prev ? prev.filter((x) => x.id !== itemId) : prev))
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setDeletingId(null)
    }
  }

  function publicUrlForToken(t: string) {
    return `${window.location.origin}/shared/digest/${encodeURIComponent(t)}`
  }

  async function handleEnsureShare(rotate = false) {
    if (!id) return
    setShareNote(null)
    setShareBusy(true)
    try {
      const res = await createSavedDigestShare(apiBase, id, { rotate })
      const url = publicUrlForToken(res.token)
      await copyTextToClipboard(url)
      setShareNote(rotate ? 'Новая ссылка скопирована в буфер обмена.' : 'Ссылка скопирована в буфер обмена.')
      setDetail((d) => (d ? { ...d, public_share_active: true } : d))
      void loadList()
    } catch (e) {
      setShareNote(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setShareBusy(false)
    }
  }

  async function handleRevokeShare() {
    if (!id) return
    setShareBusy(true)
    setShareNote(null)
    try {
      await deleteSavedDigestShare(apiBase, id)
      setShareNote('Публичная ссылка отозвана.')
      setDetail((d) => (d ? { ...d, public_share_active: false } : d))
      void loadList()
    } catch (e) {
      setShareNote(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setShareBusy(false)
    }
  }

  async function handleDownloadDocx() {
    if (!id) return
    setShareNote(null)
    setDocxBusy(true)
    try {
      await downloadSavedDigestDocx(apiBase, id)
      setShareNote('Файл .docx сохранён (или открыт загрузкой браузера).')
    } catch (e) {
      setShareNote(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setDocxBusy(false)
    }
  }

  const groupedItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (items ?? []).filter((item) => {
      if (!q) return true
      return item.title.toLowerCase().includes(q) || digestModeLabel(item.digest_mode).toLowerCase().includes(q)
    })
    return filtered.reduce<Record<string, SavedDigestListItem[]>>((acc, item) => {
      const label = dayGroupLabel(item.created_at)
      acc[label] = [...(acc[label] ?? []), item]
      return acc
    }, {})
  }, [items, query])

  if (id) {
    return (
      <div className="mx-auto max-w-5xl space-y-7 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/saved">← К списку</Link>
          </Button>
          {detail ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={docxBusy}
                onClick={() => void handleDownloadDocx()}
              >
                {docxBusy ? 'DOCX…' : 'Скачать DOCX'}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deletingId === id}
                onClick={() => void handleDelete(id)}
              >
                {deletingId === id ? 'Удаление…' : 'Удалить'}
              </Button>
            </div>
          ) : null}
        </div>

        {detail ? (
          <div className="rounded-lg border border-border/75 bg-card/95 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{digestModeLabel(detail.digest_response?.meta?.digest_mode ?? detail.monthly_digest?.meta?.digest_mode)}</Badge>
                  <Badge variant="outline">{formatWhen(detail.created_at)}</Badge>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">{detail.title}</h2>
              </div>
            </div>
            {detail.request_snapshot?.topic_queries?.length ||
            detail.monthly_request_snapshot?.topic_queries?.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Темы:{' '}
                {(
                  detail.monthly_request_snapshot?.topic_queries ??
                  detail.request_snapshot?.topic_queries ??
                  []
                ).join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {detail ? (
          <Card className="print:hidden border-border/80">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Публичная ссылка</CardTitle>
              <CardDescription>
                По ссылке дайджест доступен без входа. Не используйте для конфиденциальных данных.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={shareBusy}
                  onClick={() => void handleEnsureShare(false)}
                >
                  {detail.public_share_active ? 'Скопировать ссылку' : 'Включить и скопировать ссылку'}
                </Button>
                {detail.public_share_active ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={shareBusy}
                      onClick={() => void handleEnsureShare(true)}
                    >
                      Новый токен
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={shareBusy}
                      onClick={() => void handleRevokeShare()}
                    >
                      Отозвать
                    </Button>
                  </>
                ) : null}
              </div>
              {shareNote ? <p className="text-sm text-muted-foreground">{shareNote}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        <DigestResultView
          loading={loading}
          error={error}
          data={detail?.monthly_digest ?? detail?.digest_response ?? undefined}
        />
        {detail?.monthly_digest?.structured_delta ? (
          <div className="mt-10 space-y-4">
            <h3 className="text-lg font-heading font-medium">Структурированные тренды</h3>
            <StructuredDeltaView delta={detail.monthly_digest.structured_delta} />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-8">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4 rounded-lg border border-border/75 bg-card/95 p-5 shadow-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Research History</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Архив исследований</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Сохранённые дайджесты, повторные темы и результаты, которыми можно делиться с коллегами.
            </p>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по теме, режиму или названию"
            className="max-w-xl"
          />
        </div>
        <div className="grid gap-3 rounded-lg border border-border/75 bg-muted/20 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Всего</span>
            <span className="font-semibold">{items?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Публичные</span>
            <span className="font-semibold">{items?.filter((item) => item.public_share_active).length ?? 0}</span>
          </div>
          <Button type="button" asChild>
            <Link to="/">Новый дайджест</Link>
          </Button>
        </div>
      </section>

      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardContent className="p-5">
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Ошибка</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : !items?.length ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/15 p-6 text-sm text-muted-foreground">
              Пока нет сохранённых дайджестов. Сформируйте первый обзор и сохраните его в архив.
            </div>
          ) : !Object.keys(groupedItems).length ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/15 p-6 text-sm text-muted-foreground">
              По этому запросу ничего не найдено.
            </div>
          ) : (
            <div className="space-y-7">
              {Object.entries(groupedItems).map(([label, rows]) => (
                <section key={label} className="space-y-3">
                  <h3 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {rows.map((row) => (
                      <article key={row.id} className="rounded-lg border border-border/75 bg-background/70 p-4 transition-colors hover:border-primary/35 hover:bg-background">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{digestModeLabel(row.digest_mode)}</Badge>
                              {row.used_for_llm != null ? <Badge variant="outline">{row.used_for_llm} работ</Badge> : null}
                              {row.public_share_active ? (
                                <Badge variant="outline" className="text-xs font-normal">
                                  ссылка
                                </Badge>
                              ) : null}
                            </div>
                            <Link
                              to={`/saved/${row.id}`}
                              className="block truncate text-base font-semibold tracking-tight text-foreground hover:text-primary"
                            >
                              {row.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">{formatWhen(row.created_at)}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Button type="button" variant="secondary" size="sm" asChild>
                            <Link to={`/saved/${row.id}`}>Открыть</Link>
                          </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={deletingId === row.id}
                        onClick={() => void handleDelete(row.id)}
                      >
                        {deletingId === row.id ? '…' : 'Удалить'}
                      </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
