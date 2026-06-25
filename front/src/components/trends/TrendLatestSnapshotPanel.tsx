import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TrendLatestSnapshotSummary } from '@/types/api'

type TrendLatestSnapshotPanelProps = {
  latest: TrendLatestSnapshotSummary | null | undefined
}

export function TrendLatestSnapshotPanel({ latest }: TrendLatestSnapshotPanelProps) {
  if (!latest) return null

  const hasDigest = Boolean(latest.digest_available && latest.digest_ru?.trim())
  const hasDelta = Boolean(latest.structured_delta && !latest.structured_delta.is_baseline)

  if (!hasDigest && !hasDelta) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Последний период — {latest.period}</CardTitle>
        <CardDescription>
          Текст дайджеста и структурированные изменения к прошлому периоду без открытия боковой панели.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasDigest ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Дайджест за период</h3>
            <ScrollArea className="h-[min(280px,40vh)] w-full rounded-md border">
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

        {latest.structured_delta ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Изменения к прошлому периоду</h3>
            <StructuredDeltaView delta={latest.structured_delta} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
