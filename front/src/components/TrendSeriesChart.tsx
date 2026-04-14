import { useId, useMemo, useState } from 'react'

import { deltaSignedClass } from '@/lib/deltaClass'
import { cn } from '@/lib/utils'
import type { TrendSeriesPoint } from '@/types/api'

export function TrendSeriesChart({ points, maxWork }: { points: TrendSeriesPoint[]; maxWork: number }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const summaryId = useId()
  const hintId = useId()

  const summaryText = useMemo(() => {
    if (!points.length) return 'Нет точек данных.'
    const max = Math.max(...points.map((p) => p.work_count))
    const first = points[0].period
    const last = points[points.length - 1].period
    return `Динамика топа: ${points.length} периодов, с ${first} по ${last}. Максимум работ в топе за ряд: ${max}.`
  }, [points])

  if (!points.length) return null

  return (
    <div className="relative pt-2">
      <p id={summaryId} className="sr-only">
        {summaryText}
      </p>
      <p id={hintId} className="sr-only">
        Каждый столбец — один сохранённый период. Наведите курсор или сфокусируйте столбец для подсказки.
      </p>
      <div
        role="img"
        aria-labelledby={summaryId}
        aria-describedby={hintId}
        className="flex h-52 items-end gap-1 sm:h-56 sm:gap-2"
        onMouseLeave={() => setHovered(null)}
      >
        {points.map((p, i) => {
          const barH = Math.max(6, (p.work_count / maxWork) * 100)
          const active = hovered === i
          return (
            <button
              key={p.period}
              type="button"
              className={cn(
                'relative flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-t-sm outline-none transition',
                'ring-offset-background focus-visible:ring-2 focus-visible:ring-ring',
                active && 'z-10',
              )}
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              aria-label={`${p.period}: ${p.work_count} работ в топе${
                p.delta_vs_prev != null ? `, изменение к прошлому периоду ${p.delta_vs_prev > 0 ? '+' : ''}${p.delta_vs_prev}` : ''
              }`}
            >
              {active ? (
                <div
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-max max-w-[min(200px,45vw)] -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-left text-xs shadow-md"
                  role="tooltip"
                >
                  <div className="font-mono text-[11px] font-semibold text-foreground">{p.period}</div>
                  <div className="tabular-nums text-muted-foreground">
                    Работ в топе: <span className="font-medium text-foreground">{p.work_count}</span>
                  </div>
                  {p.delta_vs_prev != null ? (
                    <div className={cn('tabular-nums', deltaSignedClass(p.delta_vs_prev))}>
                      Δ к прошлому: {p.delta_vs_prev > 0 ? '+' : ''}
                      {p.delta_vs_prev}
                    </div>
                  ) : null}
                  {p.pct_change_vs_prev != null ? (
                    <div className={cn('tabular-nums', deltaSignedClass(p.pct_change_vs_prev))}>
                      Δ %: {p.pct_change_vs_prev > 0 ? '+' : ''}
                      {p.pct_change_vs_prev}%
                    </div>
                  ) : null}
                </div>
              ) : null}
              <span className="text-[10px] font-medium tabular-nums text-foreground sm:text-xs">{p.work_count}</span>
              <div className="flex w-full min-h-[4px] flex-1 items-end rounded-t-md bg-muted/80">
                <div
                  className={cn(
                    'w-full rounded-t-md transition-all',
                    active ? 'bg-primary' : 'bg-primary/85',
                  )}
                  style={{ height: `${barH}%` }}
                />
              </div>
              <span className="max-w-full truncate text-center text-[10px] text-muted-foreground">{p.period}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
