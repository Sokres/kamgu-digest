import { useId, useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { TrendSeriesPoint } from '@/types/api'

export function TrendAreaChart({ points }: { points: TrendSeriesPoint[] }) {
  const summaryId = useId()
  const summaryText = useMemo(() => {
    if (!points.length) return ''
    return `Площадной график числа работ в топе по ${points.length} периодам.`
  }, [points])

  if (!points.length) return null

  const yMax = Math.max(1, ...points.map((p) => p.work_count))

  return (
    <div className="rounded-xl border border-border/80 bg-gradient-to-b from-primary/5 to-transparent p-3 md:p-4 print:hidden">
      <h4 className="mb-1 text-sm font-semibold text-foreground">Динамика (площадь)</h4>
      <p className="mb-3 text-xs text-muted-foreground">Тот же показатель, что столбцы выше — наглядный тренд.</p>
      <p id={summaryId} className="sr-only">
        {summaryText}
      </p>
      <div role="img" aria-labelledby={summaryId} className="w-full">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: points.length > 8 ? 44 : 24 }}>
            <defs>
              <linearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              angle={points.length > 6 ? -35 : 0}
              textAnchor={points.length > 6 ? 'end' : 'middle'}
              height={points.length > 6 ? 52 : 28}
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
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as TrendSeriesPoint
                return (
                  <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md">
                    <div className="font-mono text-[11px] font-semibold">{p.period}</div>
                    <div className="tabular-nums text-muted-foreground">
                      Работ в топе: <span className="font-medium text-foreground">{p.work_count}</span>
                    </div>
                  </div>
                )
              }}
              cursor={{ stroke: 'var(--border)', strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="work_count"
              name="Работ в топе"
              stroke="var(--chart-2)"
              strokeWidth={2}
              fill="url(#trendAreaFill)"
              activeDot={{ r: 5, fill: 'var(--chart-2)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
