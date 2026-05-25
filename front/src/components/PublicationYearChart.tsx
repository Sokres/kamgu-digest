import { useId, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { PublicationInput } from '@/types/api'

type YearRow = { year: string; count: number; sortKey: number }

function aggregateByYear(pubs: PublicationInput[]): YearRow[] {
  const map = new Map<string, number>()
  for (const p of pubs) {
    const raw = p.year
    const y =
      raw != null && !Number.isNaN(Number(raw)) ? String(Math.trunc(Number(raw))) : 'н/д'
    map.set(y, (map.get(y) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([year, count]) => ({
      year,
      count,
      sortKey: year === 'н/д' ? Number.POSITIVE_INFINITY : Number(year),
    }))
    .sort((a, b) => {
      if (a.sortKey === b.sortKey) return a.year.localeCompare(b.year, 'ru')
      return a.sortKey - b.sortKey
    })
}

function YearTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ value?: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const n = payload[0].value
  return (
    <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md">
      {label ? <div className="font-mono text-[11px] font-semibold text-foreground">{label}</div> : null}
      <div className="tabular-nums text-muted-foreground">
        Публикаций: <span className="font-medium text-foreground">{n}</span>
      </div>
    </div>
  )
}

export function PublicationYearChart({ publications }: { publications: PublicationInput[] }) {
  const summaryId = useId()
  const data = useMemo(() => aggregateByYear(publications), [publications])
  const summaryText = useMemo(() => {
    if (!data.length) return ''
    const total = data.reduce((s, r) => s + r.count, 0)
    return `Распределение ${total} записей по годам публикации: ${data.length} столбцов.`
  }, [data])

  if (!publications.length || !data.length) return null

  return (
    <div className="rounded-lg border border-border/80 bg-muted/10 p-3 md:p-4 print:hidden">
      <p id={summaryId} className="sr-only">
        {summaryText}
      </p>
      <div role="img" aria-labelledby={summaryId} className="w-full">
        <ResponsiveContainer width="100%" height={Math.min(64 + data.length * 36, 420)}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal vertical={false} />
            <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="year"
              width={44}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <Tooltip content={<YearTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.12 }} />
            <Bar dataKey="count" name="Публикаций" fill="var(--chart-3)" radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground md:hidden">Год выпуска · число записей в корпусе</p>
    </div>
  )
}
