import { useMemo, useId } from 'react'
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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TrendConceptEvolutionPoint } from '@/types/api'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function trunc(s: string, n: number) {
  const t = s.trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

export function TrendConceptEvolutionChart({
  evolution,
}: {
  evolution: TrendConceptEvolutionPoint[]
}) {
  const summaryId = useId()

  const { chartData, conceptKeys } = useMemo(() => {
    const freq = new Map<string, number>()
    for (const pt of evolution) {
      for (const name of Object.keys(pt.shares)) {
        freq.set(name, (freq.get(name) ?? 0) + 1)
      }
    }
    const keys = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name)

    const data = evolution.map((pt) => {
      const row: Record<string, string | number> = { period: pt.period }
      for (const key of keys) {
        row[key] = Math.round((pt.shares[key] ?? 0) * 1000) / 10
      }
      return row
    })

    return { chartData: data, conceptKeys: keys }
  }, [evolution])

  if (!evolution.length || !conceptKeys.length) return null

  const summaryText = `Эволюция долей топ-концептов по ${evolution.length} периодам.`

  return (
    <Card className="print:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Эволюция концептов</CardTitle>
        <CardDescription>Доли топ-5 OpenAlex-концептов в корпусе снимка (%).</CardDescription>
      </CardHeader>
      <CardContent>
        <p id={summaryId} className="sr-only">
          {summaryText}
        </p>
        <div role="img" aria-labelledby={summaryId} className="w-full">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="period"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              />
              <YAxis
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                formatter={(v: number) => [`${v}%`, 'доля']}
                labelFormatter={(l) => `Период ${l}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value: string) => trunc(value, 28)}
              />
              {conceptKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
