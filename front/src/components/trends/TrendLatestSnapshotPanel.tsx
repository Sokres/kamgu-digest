import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TrendLatestSnapshotSummary } from '@/types/api'

type TrendLatestSnapshotPanelProps = {
  latest: TrendLatestSnapshotSummary | null | undefined
  onOpen?: (period: string) => void
}

export function TrendLatestSnapshotPanel({ latest, onOpen }: TrendLatestSnapshotPanelProps) {
  if (!latest) return null

  const hasDigest = Boolean(latest.digest_available && latest.digest_ru?.trim())
  const isBaseline = latest.structured_delta?.is_baseline === true

  return (
    <Card className="border-border/75 bg-card/95">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Последний снимок — {latest.period}</CardTitle>
            <CardDescription>
              {isBaseline
                ? 'Это базовый снимок направления. Сравнение появится после следующего сохранённого периода.'
                : 'Текст дайджеста и структурированные изменения к прошлому периоду.'}
            </CardDescription>
          </div>
          {onOpen ? (
            <Button type="button" variant="default" size="sm" onClick={() => onOpen(latest.period)}>
              Открыть снимок
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasDigest ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Дайджест за период</h3>
            <ScrollArea className="h-[min(420px,55vh)] w-full rounded-md border">
              <div className="digest-prose mx-auto max-w-prose p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {latest.digest_ru}
                </pre>
              </div>
            </ScrollArea>
          </div>
        ) : (
          <Alert>
            <AlertDescription className="text-sm">
              Текст дайджеста для этого периода не сохранён — доступны только метрики сравнения.
            </AlertDescription>
          </Alert>
        )}

        {latest.structured_delta && !isBaseline ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Изменения к прошлому периоду</h3>
            <StructuredDeltaView delta={latest.structured_delta} />
          </div>
        ) : isBaseline ? (
          <Alert>
            <AlertDescription className="text-pretty text-sm">
              Пока есть только один период. Он не потерян и не “ничего не делает”: он становится базовой линией,
              с которой будет сравниваться следующий месяц.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
