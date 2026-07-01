import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TrendSnapshotDetail } from '@/types/api'

type TrendSnapshotSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  period: string | null
  detail: TrendSnapshotDetail | null
  loading: boolean
  error: string | null
}

export function TrendSnapshotSheet({
  open,
  onOpenChange,
  period,
  detail,
  loading,
  error,
}: TrendSnapshotSheetProps) {
  const hasDigest = Boolean(detail?.digest_available && detail.digest_ru?.trim())
  const isBaseline = detail?.structured_delta?.is_baseline === true
  const isEmptySnapshot =
    detail != null &&
    !loading &&
    !detail.digest_available &&
    detail.works.length === 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        showCloseButton
        className="flex h-full w-[min(96vw,1180px)] max-w-[min(96vw,1180px)] flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 text-foreground shadow-xl sm:max-w-[min(96vw,1180px)]"
      >
        <SheetHeader className="shrink-0 border-b border-border bg-muted/40 px-6 py-5 pr-14">
          <SheetTitle className="text-lg text-foreground">Снимок {period ?? ''}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {detail?.created_at ? `Сохранён: ${detail.created_at}` : 'Загрузка содержимого снимка…'}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-6 py-6">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-56 w-full rounded-lg" />
              </div>
            ) : null}

            {!loading && isEmptySnapshot ? (
              <Alert>
                <AlertDescription className="text-pretty text-sm text-foreground">
                  Снимок за этот период есть, но текст дайджеста и список работ недоступны.
                </AlertDescription>
              </Alert>
            ) : null}

            {!loading && detail && !detail.digest_available && detail.works.length > 0 ? (
              <Alert className="border-border bg-muted/30">
                <AlertDescription className="text-pretty text-sm text-foreground">
                  Текст дайджеста для этого периода не сохранён (старый снимок). Ниже — список работ в топе (
                  {detail.work_count}).
                </AlertDescription>
              </Alert>
            ) : null}

            {!loading && isBaseline ? (
              <Alert className="border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30">
                <AlertDescription className="text-pretty text-sm text-amber-950/90 dark:text-amber-50/90">
                  Это базовый снимок. В нём есть дайджест и список работ, но нет сравнения с прошлым периодом, потому
                  что предыдущего периода ещё нет.
                </AlertDescription>
              </Alert>
            ) : null}

            {!loading && hasDigest ? (
              <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                <h3 className="text-base font-semibold text-foreground">Дайджест за период</h3>
                <ScrollArea className="h-[min(360px,50vh)] w-full rounded-md border border-border bg-background">
                  <div className="digest-prose mx-auto max-w-prose p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                      {detail?.digest_ru}
                    </pre>
                  </div>
                </ScrollArea>
              </section>
            ) : null}

            {!loading && detail?.structured_delta && !isBaseline ? (
              <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                <h3 className="text-base font-semibold text-foreground">Изменения к прошлому периоду</h3>
                <StructuredDeltaView delta={detail.structured_delta} />
              </section>
            ) : null}

            {!loading && detail && detail.works.length > 0 ? (
              <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                <h3 className="text-base font-semibold text-foreground">
                  Работы в топе <span className="font-normal text-muted-foreground">({detail.works.length})</span>
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="w-10 text-foreground">#</TableHead>
                      <TableHead className="text-foreground">Название</TableHead>
                      <TableHead className="hidden text-right text-foreground sm:table-cell">Год</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.works.map((w) => (
                      <TableRow key={w.dedupe_key}>
                        <TableCell className="tabular-nums text-sm text-foreground">{w.rank}</TableCell>
                        <TableCell className="min-w-0 text-sm text-foreground wrap-break-word">{w.title}</TableCell>
                        <TableCell className="hidden text-right text-sm text-foreground sm:table-cell">
                          {w.year ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
