import { useId, useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { deltaSignedClass } from '@/lib/deltaClass'
import type { TrendSeriesPoint } from '@/types/api'

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload: TrendSeriesPoint }>
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md">
      <div className="font-mono text-[11px] font-semibold text-foreground">{p.period}</div>
      <div className="tabular-nums text-muted-foreground">
        Работ в топе: <span className="font-medium text-foreground">{p.work_count}</span>
      </div>
      {p.delta_vs_prev != null ? (
        <div className={`tabular-nums ${deltaSignedClass(p.delta_vs_prev)}`}>
          Δ к прошлому: {p.delta_vs_prev > 0 ? '+' : ''}
          {p.delta_vs_prev}
        </div>
      ) : null}
      {p.pct_change_vs_prev != null ? (
        <div className={`tabular-nums ${deltaSignedClass(p.pct_change_vs_prev)}`}>
          Δ %: {p.pct_change_vs_prev > 0 ? '+' : ''}
          {p.pct_change_vs_prev}%
        </div>
      ) : null}
    </div>
  )
}

export function TrendSeriesChart({ points, maxWork }: { points: TrendSeriesPoint[]; maxWork: number }) {
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

  const yMax = Math.max(maxWork, 1)

  return (
    <div className="relative pt-2">
      <p id={summaryId} className="sr-only">
        {summaryText}
      </p>
      <p id={hintId} className="sr-only">
        Столбчатая диаграмма и линия тренда: период по оси X, число работ в топе по оси Y. Подсказка при наведении.
      </p>
      <div
        role="img"
        aria-labelledby={summaryId}
        aria-describedby={hintId}
        className="w-full print:hidden"
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={points}
            margin={{ top: 8, right: 12, left: 0, bottom: points.length > 8 ? 48 : 28 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              angle={points.length > 6 ? -35 : 0}
              textAnchor={points.length > 6 ? 'end' : 'middle'}
              height={points.length > 6 ? 56 : 28}
              interval={0}
            />
            <YAxis
              width={40}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[0, yMax]}
              allowDecimals={false}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.15 }} />
            <Bar
              dataKey="work_count"
              name="Работ в топе"
              fill="var(--primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={52}
            />
            <Line
              type="monotone"
              dataKey="work_count"
              name="Тренд"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--chart-2)' }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
