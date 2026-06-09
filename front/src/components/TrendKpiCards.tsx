import { useMemo } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { deltaSignedClass } from '@/lib/deltaClass'
import type { TrendPeriodHighlight, TrendSeriesPoint } from '@/types/api'

type TrendKpiCardsProps = {
  points: TrendSeriesPoint[]
  highlights?: TrendPeriodHighlight[]
}

export function TrendKpiCards({ points, highlights = [] }: TrendKpiCardsProps) {
  const stats = useMemo(() => {
    if (!points.length) return null
    const last = points[points.length - 1]
    const first = points[0]
    const withPct = points.filter((p) => p.pct_change_vs_prev != null) as Array<
      TrendSeriesPoint & { pct_change_vs_prev: number }
    >
    const avgPct =
      withPct.length > 0
        ? Math.round(withPct.reduce((s, p) => s + p.pct_change_vs_prev, 0) / withPct.length)
        : null
    const maxTop = Math.max(...points.map((p) => p.work_count))
    const minTop = Math.min(...points.map((p) => p.work_count))
    const span = points.length > 1 ? last.work_count - first.work_count : null

    const lastHighlight = highlights.length
      ? highlights[highlights.length - 1]
      : null
    const churn =
      lastHighlight && !lastHighlight.is_baseline
        ? (lastHighlight.entered_count ?? 0) + (lastHighlight.left_count ?? 0)
        : null

    return {
      last,
      first,
      avgPct,
      maxTop,
      minTop,
      span,
      periods: points.length,
      lastHighlight,
      churn,
    }
  }, [points, highlights])

  if (!stats) return null

  const { last, first, avgPct, maxTop, minTop, span, periods, lastHighlight, churn } = stats

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 print:hidden">
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Сейчас в топе</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{last.work_count}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">период {last.period}</p>
        </CardContent>
      </Card>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Диапазон ряда</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {minTop} — {maxTop}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            за {periods} {periods === 1 ? 'точку' : periods < 5 ? 'точки' : 'точек'}
          </p>
        </CardContent>
      </Card>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Старт → финиш</p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tabular-nums',
              span != null ? deltaSignedClass(span) : 'text-foreground',
            )}
          >
            {span == null ? '—' : span > 0 ? `+${span}` : String(span)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            с {first.period} по {last.period}
          </p>
        </CardContent>
      </Card>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Средн. Δ % к прошлому</p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tabular-nums',
              avgPct != null ? deltaSignedClass(avgPct) : 'text-foreground',
            )}
          >
            {avgPct == null ? '—' : `${avgPct > 0 ? '+' : ''}${avgPct}%`}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">по шагам, где есть сравнение</p>
        </CardContent>
      </Card>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Churn топа</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {churn == null ? '—' : churn}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            вошли + вышли за {lastHighlight?.period ?? last.period}
          </p>
        </CardContent>
      </Card>
      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Лидер Δ цит.</p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tabular-nums',
              lastHighlight?.top_citation_gain
                ? deltaSignedClass(lastHighlight.top_citation_gain.delta)
                : 'text-foreground',
            )}
          >
            {lastHighlight?.top_citation_gain
              ? `${lastHighlight.top_citation_gain.delta > 0 ? '+' : ''}${lastHighlight.top_citation_gain.delta}`
              : '—'}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
            {lastHighlight?.top_concept_shift?.name
              ? `концепт: ${lastHighlight.top_concept_shift.name}`
              : lastHighlight?.top_citation_gain?.title ?? 'нет данных'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
