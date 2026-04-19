import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { DigestResultView } from '@/components/DigestResultView'
import { PageOnboarding } from '@/components/PageOnboarding'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError, deleteSavedDigest, getSavedDigest, listSavedDigests } from '@/lib/api'
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

  if (id) {
    return (
      <div className="mx-auto max-w-4xl space-y-8 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/saved">← К списку</Link>
          </Button>
          {detail ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deletingId === id}
              onClick={() => void handleDelete(id)}
            >
              {deletingId === id ? 'Удаление…' : 'Удалить'}
            </Button>
          ) : null}
        </div>

        {detail ? (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">{detail.title}</h2>
            <p className="text-sm text-muted-foreground">{formatWhen(detail.created_at)}</p>
            {detail.request_snapshot?.topic_queries?.length ? (
              <p className="text-xs text-muted-foreground">
                Темы: {detail.request_snapshot.topic_queries.join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}

        <DigestResultView loading={loading} error={error} data={detail?.digest_response ?? undefined} />
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
              'Записи хранятся в той же базе, что и снимки трендов (SNAPSHOT_DATABASE_URL на сервере). После разового дайджеста нажмите «Сохранить» на странице дайджеста.',
          },
          {
            title: 'Просмотр и удаление',
            detail: 'Откройте запись по ссылке или удалите ненужную. Экспорт в Markdown доступен внутри просмотра.',
          },
        ]}
      />

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Список</CardTitle>
          <CardDescription className="text-pretty">
            Сохранённые результаты POST /digests. Доступны всем сессиям с тем же пользователем (JWT) или общему
            режиму без авторизации.
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
                      <Link
                        to={`/saved/${row.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.title}
                      </Link>
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
