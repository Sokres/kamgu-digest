import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { DigestResultView } from '@/components/DigestResultView'
import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { PageOnboarding } from '@/components/PageOnboarding'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

  if (id) {
    return (
      <div className="mx-auto max-w-4xl space-y-8 pb-8">
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
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{detail.title}</h2>
            <p className="text-sm text-muted-foreground">{formatWhen(detail.created_at)}</p>
            {detail.request_snapshot?.topic_queries?.length ||
            detail.monthly_request_snapshot?.topic_queries?.length ? (
              <p className="text-xs text-muted-foreground">
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
    <div className="mx-auto max-w-4xl space-y-10 pb-8">
      <PageOnboarding
        title="Сохранённые дайджесты"
        steps={[
          {
            title: 'Хранение',
            detail:
              'Записи хранятся на сервере. Сохраняйте разовый дайджест или результат снимка с вкладки «Снимок».',
          },
          {
            title: 'Просмотр и ссылка',
            detail:
              'Экспорт и копирование — внутри записи. Опционально включите публичную ссылку для коллег без учётной записи.',
          },
        ]}
      />

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Список</CardTitle>
          <CardDescription className="text-pretty">
            Сохранённые полные ответы разового дайджеста. Видны при входе под тем же пользователем; если вход
            отключён на сервере — общий режим без разделения по людям.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Ошибка</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : !items?.length ? (
            <p className="text-sm text-muted-foreground">Пока нет сохранённых дайджестов.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead className="hidden sm:table-cell">Дата</TableHead>
                  <TableHead className="hidden md:table-cell">Режим</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/saved/${row.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.title}
                        </Link>
                        {row.public_share_active ? (
                          <Badge variant="outline" className="text-xs font-normal">
                            ссылка
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {formatWhen(row.created_at)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {row.digest_mode === 'web_snippets' ? 'Веб-сниппеты' : 'Рецензируемый'}
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
