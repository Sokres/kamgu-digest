import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { deltaSignedClass } from '@/lib/deltaClass'
import type { TrendPeriodHighlight } from '@/types/api'
import { cn } from '@/lib/utils'

type TrendActivityFeedProps = {
  points: TrendPeriodHighlight[]
}

function periodLabel(p: TrendPeriodHighlight): string {
  if (p.is_baseline) return 'Базовая линия — первый период, сравнение недоступно.'
  const parts: string[] = []
  if (p.entered_count) parts.push(`вошли в топ: ${p.entered_count}`)
  if (p.left_count) parts.push(`вышли из топа: ${p.left_count}`)
  if (p.top_citation_gain) {
    const d = p.top_citation_gain.delta
    parts.push(
      `лидер Δ цит.: «${p.top_citation_gain.title}» (${d > 0 ? '+' : ''}${d})`,
    )
  }
  if (p.top_concept_shift) {
    const d = p.top_concept_shift.delta
    parts.push(
      `концепт «${p.top_concept_shift.name}» (${d > 0 ? '+' : ''}${d.toFixed(3)} доли)`,
    )
  }
  if (!parts.length) return 'Значимых сдвигов в structured_delta не зафиксировано.'
  return parts.join(' · ')
}

export function TrendActivityFeed({ points }: TrendActivityFeedProps) {
  const comparable = points.filter((p) => !p.is_baseline)
  if (!comparable.length) return null

  const ordered = [...comparable].reverse()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Лента изменений</CardTitle>
        <CardDescription>Ключевые события по периодам — от новых к старым.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {ordered.map((p) => (
            <li
              key={p.period}
              className="rounded-lg border border-border/80 bg-muted/10 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {p.period}
                </Badge>
                {p.compared_period ? (
                  <span className="text-[11px] text-muted-foreground">vs {p.compared_period}</span>
                ) : null}
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  работ в топе: {p.work_count}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-foreground/90 text-pretty">{periodLabel(p)}</p>
              {p.top_citation_gain ? (
                <p
                  className={cn(
                    'mt-1 text-xs tabular-nums',
                    deltaSignedClass(p.top_citation_gain.delta),
                  )}
                >
                  Макс. прирост цитирования: {p.top_citation_gain.delta > 0 ? '+' : ''}
                  {p.top_citation_gain.delta}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
