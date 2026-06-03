import { useEffect, useRef, useState } from 'react'

import { DigestPresetsBar } from '@/components/DigestPresetsBar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, createDigest, uploadPdfDocument } from '@/lib/api'
import type { DigestFormState } from '@/hooks/useDigestFormState'
import type { DigestRequest, DigestResponse } from '@/types/api'

type DigestOnceExtrasProps = {
  apiBase: string
  form: DigestFormState
  onResult: (data: DigestResponse | null, request: DigestRequest | null, error: string | null) => void
  loading: boolean
  setLoading: (v: boolean) => void
}

export function DigestOnceExtras({ apiBase, form, onResult, loading, setLoading }: DigestOnceExtrasProps) {
  const [error, setError] = useState<string | null>(null)
  const [pdfAttachments, setPdfAttachments] = useState<{ id: string; name: string }[]>([])
  const [pdfUploading, setPdfUploading] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (form.digestMode !== 'peer_reviewed') {
      setPdfAttachments([])
    }
  }, [form.digestMode])

  async function handlePdfFiles(files: FileList | null) {
    if (!files?.length) return
    setPdfUploading(true)
    setError(null)
    try {
      const added: { id: string; name: string }[] = []
      for (const f of Array.from(files)) {
        if (!f.name.toLowerCase().endsWith('.pdf')) {
          setError('Можно загружать только файлы .pdf')
          continue
        }
        const res = await uploadPdfDocument(apiBase, f)
        added.push({ id: res.id, name: f.name })
      }
      if (added.length) {
        setPdfAttachments((prev) => [...prev, ...added])
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)
      setError(msg)
      onResult(null, null, msg)
    } finally {
      setPdfUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const built = form.buildDigestRequest(pdfAttachments.map((p) => p.id))
    if (!built.ok) {
      setError(built.message)
      onResult(null, null, built.message)
      return
    }

    setLoading(true)
    onResult(null, null, null)
    try {
      const res = await createDigest(apiBase, built.body)
      onResult(res, built.body, null)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err)
      setError(msg)
      onResult(null, null, msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg">Разовый запуск</CardTitle>
        <CardDescription className="text-pretty">
          Дополнительные фильтры OpenAlex и свои PDF. Ориентир 5–15 минут; не закрывайте вкладку.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <DigestPresetsBar onApply={form.applyPreset} snapshot={form.presetSnapshot} />

          {form.digestMode === 'peer_reviewed' ? (
            <>
              <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/15 p-4">
                <Checkbox
                  id="once-peer-only"
                  checked={form.peerReviewedOnly}
                  onCheckedChange={(c) => form.setPeerReviewedOnly(c === true)}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <Label htmlFor="once-peer-only" className="cursor-pointer text-sm font-medium leading-snug">
                    Только журнальные статьи
                  </Label>
                  <p className="text-xs text-muted-foreground">Только записи типа «статья» в индексе</p>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border/80 bg-muted/15 p-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Свои PDF (необязательно)</Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Файлы участвуют в отборе вместе с OpenAlex. В веб-режиме не используются.
                  </p>
                </div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(ev) => {
                    void handlePdfFiles(ev.target.files)
                    ev.target.value = ''
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={loading || pdfUploading}
                    onClick={() => pdfInputRef.current?.click()}
                  >
                    {pdfUploading ? 'Загрузка…' : 'Добавить PDF'}
                  </Button>
                  {pdfAttachments.length ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setPdfAttachments([])}
                    >
                      Очистить список
                    </Button>
                  ) : null}
                </div>
                {pdfAttachments.length ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {pdfAttachments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-[11px]" title={p.id}>
                          {p.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2 text-xs"
                          onClick={() => setPdfAttachments((prev) => prev.filter((x) => x.id !== p.id))}
                        >
                          Убрать
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="once-concept-id">OpenAlex concept id (необязательно)</Label>
                  <Input
                    id="once-concept-id"
                    value={form.openalexConceptId}
                    onChange={(e) => form.setOpenalexConceptId(e.target.value)}
                    placeholder="C2778805519 или полный URL"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="once-source-ids">OpenAlex source id (журналы), через запятую</Label>
                  <Input
                    id="once-source-ids"
                    value={form.openalexSourceIds}
                    onChange={(e) => form.setOpenalexSourceIds(e.target.value)}
                    placeholder="S123... или https://openalex.org/S..."
                  />
                </div>
              </div>
            </>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={loading} size="lg" className="min-w-[200px]">
            {loading ? 'Формирование…' : 'Сформировать дайджест'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
