import { useMemo } from 'react'
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
import type { MonthlyStructuredDelta } from '@/types/api'

function trunc(s: string, n: number) {
  const t = s.trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

function fillForDelta(d: number): string {
  if (d > 0) return 'var(--chart-1)'
  if (d < 0) return 'var(--destructive)'
  return 'var(--muted-foreground)'
}

export function StructuredDeltaCharts({ delta }: { delta: MonthlyStructuredDelta }) {
  const gains = useMemo(() => {
    const rows = delta.top_by_citation_gain ?? []
    return [...rows]
      .filter((r) => r.citation_delta != null && r.citation_delta !== 0)
      .sort((a, b) => Math.abs(b.citation_delta ?? 0) - Math.abs(a.citation_delta ?? 0))
      .slice(0, 14)
      .map((r) => ({
        key: r.dedupe_key,
        title: trunc(r.title, 48),
        delta: r.citation_delta as number,
      }))
  }, [delta.top_by_citation_gain])

  const concepts = useMemo(() => {
    const rows = delta.concept_share_deltas ?? []
    return [...rows]
      .filter((r) => r.delta != null && Math.abs(r.delta) > 0.0005)
      .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
      .slice(0, 12)
      .map((r) => ({
        key: r.concept_name,
        name: trunc(r.concept_name, 40),
        delta: (r.delta ?? 0) * 100,
      }))
  }, [delta.concept_share_deltas])

  if (delta.is_baseline) return null
  if (!gains.length && !concepts.length) return null

  return (
    <div className="grid gap-4 lg:grid-cols-2 print:hidden">
      {gains.length > 0 ? (
        <div className="rounded-xl border border-border/80 bg-gradient-to-br from-chart-1/5 to-transparent p-3 md:p-4">
          <h4 className="mb-1 text-sm font-semibold">Рост цитирования (топ по Δ)</h4>
          <p className="mb-2 text-[11px] text-muted-foreground">Сравнение с прошлым сохранённым снимком.</p>
          <ResponsiveContainer width="100%" height={Math.min(320, 100 + gains.length * 22)}>
            <BarChart data={gains} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal vertical={false} />
              <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="title"
                width={148}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.1 }}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const row = payload[0].payload as (typeof gains)[0]
                  return (
                    <div className="rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md">
                      <div className={`font-semibold tabular-nums ${deltaSignedClass(row.delta)}`}>
                        Δ цит.: {row.delta > 0 ? '+' : ''}
                        {row.delta}
                      </div>
                    </div>
                  )
                }}
              />
              <Bar dataKey="delta" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {gains.map((e) => (
                  <Cell key={e.key} fill={fillForDelta(e.delta)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {concepts.length > 0 ? (
        <div className="rounded-xl border border-border/80 bg-gradient-to-br from-chart-2/5 to-transparent p-3 md:p-4">
          <h4 className="mb-1 text-sm font-semibold">Сдвиг долей концептов (% п.п.)</h4>
          <p className="mb-2 text-[11px] text-muted-foreground">×100 от доли в корпусе; крупнейшие изменения.</p>
          <ResponsiveContainer width="100%" height={Math.min(320, 100 + concepts.length * 22)}>
            <BarChart data={concepts} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal vertical={false} />
              <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={132}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => [`${v > 0 ? '+' : ''}${v.toFixed(2)} п.п.`, 'Δ доли']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="delta" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {concepts.map((e) => (
                  <Cell key={e.key} fill={fillForDelta(e.delta)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  )
}
