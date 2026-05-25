import { useId, useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { TrendSeriesPoint } from '@/types/api'

type MergedRow = {
  period: string
  count_a: number | null
  count_b: number | null
}

function mergeSeries(a: TrendSeriesPoint[], b: TrendSeriesPoint[]): MergedRow[] {
  const periods = [...new Set([...a.map((p) => p.period), ...b.map((p) => p.period)])].sort()
  return periods.map((period) => ({
    period,
    count_a: a.find((p) => p.period === period)?.work_count ?? null,
    count_b: b.find((p) => p.period === period)?.work_count ?? null,
  }))
}

function CompareTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: string; name?: string; value?: number | null; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md">
      {label ? <div className="mb-1 font-mono text-[11px] font-semibold text-foreground">{label}</div> : null}
      <ul className="space-y-0.5">
        {payload.map((e) => (
          <li key={String(e.dataKey)} className="flex items-center gap-2 tabular-nums">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
            <span className="text-muted-foreground">{e.name}:</span>
            <span className="font-medium text-foreground">{e.value ?? '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TrendCompareChart({
  seriesA,
  seriesB,
  labelA,
  labelB,
}: {
  seriesA: TrendSeriesPoint[]
  seriesB: TrendSeriesPoint[]
  labelA: string
  labelB: string
}) {
  const summaryId = useId()
  const hintId = useId()
  const data = useMemo(() => mergeSeries(seriesA, seriesB), [seriesA, seriesB])
  const maxY = useMemo(() => {
    const vals = data.flatMap((r) => [r.count_a, r.count_b]).filter((v): v is number => v != null)
    return Math.max(1, ...vals)
  }, [data])

  const summaryText = useMemo(() => {
    if (!data.length) return 'Нет данных для сравнения.'
    return `Сравнение двух профилей по ${data.length} периодам: ${labelA} и ${labelB}.`
  }, [data.length, labelA, labelB])

  if (!data.length) return null

  return (
    <div className="pt-2">
      <p id={summaryId} className="sr-only">
        {summaryText}
      </p>
      <p id={hintId} className="sr-only">
        Два ряда на одном графике: период по горизонтали, число работ в топе по вертикали.
      </p>
      <div role="img" aria-labelledby={summaryId} aria-describedby={hintId} className="w-full print:hidden">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: data.length > 8 ? 44 : 24 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              angle={data.length > 6 ? -35 : 0}
              textAnchor={data.length > 6 ? 'end' : 'middle'}
              height={data.length > 6 ? 52 : 28}
              interval={0}
            />
            <YAxis
              width={40}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[0, maxY]}
              allowDecimals={false}
            />
            <Tooltip content={<CompareTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) => <span className="text-foreground">{value}</span>}
            />
            <Line
              type="monotone"
              dataKey="count_a"
              name={labelA}
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--primary)' }}
              activeDot={{ r: 5 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="count_b"
              name={labelB}
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--chart-2)' }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
