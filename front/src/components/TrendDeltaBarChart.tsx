import { useId, useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { deltaSignedClass } from '@/lib/deltaClass'
import type { TrendSeriesPoint } from '@/types/api'

function barFill(delta: number): string {
  if (delta > 0) return 'var(--chart-1)'
  if (delta < 0) return 'var(--destructive)'
  return 'var(--muted-foreground)'
}

export function TrendDeltaBarChart({ points }: { points: TrendSeriesPoint[] }) {
  const summaryId = useId()
  const data = useMemo(() => {
    return points
      .filter((p) => p.delta_vs_prev != null)
      .map((p) => ({
        period: p.period,
        delta: p.delta_vs_prev as number,
        pct: p.pct_change_vs_prev,
      }))
  }, [points])

  const summaryText = useMemo(() => {
    if (!data.length) return 'Нет данных об изменении к предыдущему периоду.'
    const pos = data.filter((d) => d.delta > 0).length
    const neg = data.filter((d) => d.delta < 0).length
    return `Изменение размера топа: ${data.length} шагов — рост в ${pos}, спад в ${neg} периодах.`
  }, [data])

  if (!data.length) return null

  return (
    <div className="rounded-xl border border-border/80 bg-gradient-to-b from-muted/15 to-transparent p-3 md:p-4 print:hidden">
      <h4 className="mb-1 text-sm font-semibold text-foreground">Прирост / спад к прошлому периоду</h4>
      <p className="mb-3 text-xs text-muted-foreground">Δ работ в топе по месяцам (первый сохранённый период без столбца).</p>
      <p id={summaryId} className="sr-only">
        {summaryText}
      </p>
      <div role="img" aria-labelledby={summaryId} className="w-full">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: data.length > 7 ? 40 : 24 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              angle={data.length > 5 ? -30 : 0}
              textAnchor={data.length > 5 ? 'end' : 'middle'}
              height={data.length > 5 ? 48 : 28}
              interval={0}
            />
            <YAxis
              width={36}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.12 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as (typeof data)[0]
                return (
                  <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md">
                    <div className="font-mono text-[11px] font-semibold">{row.period}</div>
                    <div className={`tabular-nums ${deltaSignedClass(row.delta)}`}>
                      Δ работ: {row.delta > 0 ? '+' : ''}
                      {row.delta}
                    </div>
                    {row.pct != null ? (
                      <div className={`tabular-nums ${deltaSignedClass(row.pct)}`}>
                        Δ %: {row.pct > 0 ? '+' : ''}
                        {row.pct}%
                      </div>
                    ) : null}
                  </div>
                )
              }}
            />
            <Bar dataKey="delta" name="Δ к прошлому" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((entry) => (
                <Cell key={entry.period} fill={barFill(entry.delta)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
