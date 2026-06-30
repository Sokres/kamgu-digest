import { DigestResultView } from '@/components/DigestResultView'
import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { MonthlyDigestResponse, TrendSnapshotDetail } from '@/types/api'

type TrendSnapshotSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  period: string | null
  detail: TrendSnapshotDetail | null
  loading: boolean
  error: string | null
}

function detailToMonthlyResponse(d: TrendSnapshotDetail): MonthlyDigestResponse | null {
  if (!d.digest_available) return null
  return {
    publications_used: d.publications_used,
    article_cards: d.article_cards,
    digest_ru: d.digest_ru,
    digest_en: d.digest_en,
    structured_delta: d.structured_delta ?? {
      profile_id: d.profile_id,
      current_period: d.period,
    },
    meta: d.meta ?? undefined,
  }
}

export function TrendSnapshotSheet({
  open,
  onOpenChange,
  period,
  detail,
  loading,
  error,
}: TrendSnapshotSheetProps) {
  const monthly = detail ? detailToMonthlyResponse(detail) : null
  const isBaseline = detail?.structured_delta?.is_baseline === true
  const isEmptySnapshot =
    detail != null &&
    !loading &&
    !detail.digest_available &&
    detail.works.length === 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[96vw] flex-col overflow-y-auto sm:max-w-[min(1180px,96vw)]">
        <SheetHeader>
          <SheetTitle>Снимок {period ?? ''}</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {detail?.created_at ? `Сохранён: ${detail.created_at}` : ' '}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-6 pb-8">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {isEmptySnapshot ? (
            <Alert>
              <AlertDescription className="text-pretty text-sm">
                Снимок за этот период есть, но текст дайджеста и список работ недоступны.
              </AlertDescription>
            </Alert>
          ) : null}

          {detail && !detail.digest_available && !loading && detail.works.length > 0 ? (
            <Alert>
              <AlertDescription className="text-pretty text-sm">
                Текст дайджеста для этого периода не сохранён (старый снимок). Ниже — список работ в топе (
                {detail.work_count}).
              </AlertDescription>
            </Alert>
          ) : null}

          {isBaseline ? (
            <Alert>
              <AlertDescription className="text-pretty text-sm">
                Это базовый снимок. В нём есть дайджест и список работ, но нет сравнения с прошлым периодом, потому что
                предыдущего периода ещё нет.
              </AlertDescription>
            </Alert>
          ) : null}

          <DigestResultView
            loading={loading}
            error={error && !detail ? error : null}
            data={monthly ?? undefined}
          />

          {detail?.structured_delta && detail.digest_available ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Структурированные тренды</h3>
              <StructuredDeltaView delta={detail.structured_delta} />
            </div>
          ) : null}

          {detail && detail.works.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Работы в топе</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Год</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.works.map((w) => (
                    <TableRow key={w.dedupe_key}>
                      <TableCell className="tabular-nums text-xs">{w.rank}</TableCell>
                      <TableCell className="min-w-0 break-words text-sm">{w.title}</TableCell>
                      <TableCell className="hidden text-right sm:table-cell">{w.year ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
