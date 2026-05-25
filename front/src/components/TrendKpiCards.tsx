import { useMemo } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { deltaSignedClass } from '@/lib/deltaClass'
import type { TrendSeriesPoint } from '@/types/api'

export function TrendKpiCards({ points }: { points: TrendSeriesPoint[] }) {
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
    return { last, first, avgPct, maxTop, minTop, span, periods: points.length }
  }, [points])

  if (!stats) return null

  const { last, first, avgPct, maxTop, minTop, span, periods } = stats

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
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
    </div>
  )
}
