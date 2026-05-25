import { useId, useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DigestMode, PublicationInput } from '@/types/api'

function binCitations(pubs: PublicationInput[]): { label: string; count: number }[] {
  const buckets: Record<string, number> = {
    '0': 0,
    '1–10': 0,
    '11–50': 0,
    '51–200': 0,
    '200+': 0,
    'н/д': 0,
  }
  for (const p of pubs) {
    const c = p.citation_count
    if (c == null || Number.isNaN(Number(c))) {
      buckets['н/д'] += 1
      continue
    }
    const n = Number(c)
    if (n <= 0) buckets['0'] += 1
    else if (n <= 10) buckets['1–10'] += 1
    else if (n <= 50) buckets['11–50'] += 1
    else if (n <= 200) buckets['51–200'] += 1
    else buckets['200+'] += 1
  }
  const order = ['0', '1–10', '11–50', '51–200', '200+', 'н/д']
  return order.map((label) => ({ label, count: buckets[label] })).filter((x) => x.count > 0)
}

function topField(
  pubs: PublicationInput[],
  pick: (p: PublicationInput) => string,
  topN: number,
): { name: string; count: number }[] {
  const map = new Map<string, number>()
  for (const p of pubs) {
    const raw = pick(p).trim()
    const key = raw || '—'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
}

function truncate(s: string, max = 36): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function topConcepts(pubs: PublicationInput[], topN: number): { name: string; score: number }[] {
  const map = new Map<string, number>()
  for (const p of pubs) {
    for (const c of p.concepts ?? []) {
      const name = (c.display_name ?? c.id ?? '').trim()
      if (!name) continue
      const add = typeof c.score === 'number' && !Number.isNaN(c.score) ? c.score : 1
      map.set(name, (map.get(name) ?? 0) + add)
    }
  }
  return [...map.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}

function oaData(pubs: PublicationInput[]): { name: string; value: number }[] {
  let oa = 0
  let closed = 0
  let unknown = 0
  for (const p of pubs) {
    if (p.is_open_access === true) oa += 1
    else if (p.is_open_access === false) closed += 1
    else unknown += 1
  }
  const out: { name: string; value: number }[] = []
  if (oa) out.push({ name: 'Открытый доступ', value: oa })
  if (closed) out.push({ name: 'Закрытый / неизв.', value: closed })
  if (unknown) out.push({ name: 'Нет данных', value: unknown })
  return out
}

const PIE_COLORS = ['var(--chart-1)', 'var(--chart-3)', 'var(--muted-foreground)']

export function DigestCorpusCharts({
  publications,
  mode,
}: {
  publications: PublicationInput[]
  mode: DigestMode
}) {
  const sid = useId()

  const citationRows = useMemo(() => binCitations(publications), [publications])
  const sourceRows = useMemo(() => {
    if (mode === 'web_snippets') {
      return topField(
        publications,
        (p) => {
          try {
            if (!p.url?.trim()) return '—'
            const u = new URL(p.url)
            return u.hostname.replace(/^www\./, '')
          } catch {
            return '—'
          }
        },
        10,
      )
    }
    return topField(publications, (p) => p.source || '—', 10)
  }, [publications, mode])
  const conceptRows = useMemo(() => topConcepts(publications, 14), [publications])
  const pieRows = useMemo(() => oaData(publications), [publications])

  if (!publications.length) return null

  const sourceTitle = mode === 'web_snippets' ? 'Домены (URL)' : 'Журналы / источники'

  return (
    <div className="grid gap-4 sm:grid-cols-2 print:hidden">
      <div className="rounded-lg border border-border/80 bg-muted/10 p-3 md:p-4">
        <h4 className="mb-2 text-sm font-semibold">Цитирования (корзины)</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">Сколько работ в выборке попало в диапазон по citation_count.</p>
        {citationRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет данных.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={citationRows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickLine={false} />
              <YAxis
                width={32}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(v: number) => [v, 'Публикаций']}
              />
              <Bar dataKey="count" fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-lg border border-border/80 bg-muted/10 p-3 md:p-4">
        <h4 className="mb-2 text-sm font-semibold">{sourceTitle}</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">Топ-{sourceRows.length} по числу записей в дайджесте.</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={sourceRows.map((r) => ({ ...r, short: truncate(r.name, 32) }))}
            layout="vertical"
            margin={{ top: 4, right: 8, left: 4, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal vertical={false} />
            <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="short"
              width={108}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }}
              tickLine={false}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload?.length) return null
                const row = payload[0].payload as { name: string; count: number }
                return (
                  <div className="max-w-xs rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md">
                    <div className="text-[11px] text-foreground">{row.name}</div>
                    <div className="tabular-nums text-muted-foreground">{row.count} записей</div>
                  </div>
                )
              }}
            />
            <Bar dataKey="count" fill="var(--chart-5)" radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {conceptRows.length > 0 && mode === 'peer_reviewed' ? (
        <div className="rounded-lg border border-border/80 bg-muted/10 p-3 md:p-4 sm:col-span-2">
          <h4 className="mb-2 text-sm font-semibold">Концепты OpenAlex (вес по score)</h4>
          <p className="mb-2 text-[11px] text-muted-foreground">Сумма score по работам для топа тем.</p>
          <ResponsiveContainer width="100%" height={Math.min(360, 120 + conceptRows.length * 22)}>
            <BarChart
              data={conceptRows.map((r) => ({ ...r, short: truncate(r.name, 40) }))}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal vertical={false} />
              <XAxis type="number" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="short"
                width={140}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: number) => [v.toFixed(2), 'Вес']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="score" fill="var(--chart-2)" radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {pieRows.length > 0 && mode === 'peer_reviewed' ? (
        <div className="rounded-lg border border-border/80 bg-muted/10 p-3 md:p-4 sm:col-span-2">
          <h4 className="mb-1 text-sm font-semibold">Открытый доступ (выборка)</h4>
          <p id={sid} className="sr-only">
            Круговая диаграмма доли записей с признаком открытого доступа.
          </p>
          <div className="flex flex-col items-center gap-2 md:flex-row md:items-start md:gap-8">
            <div role="img" aria-labelledby={sid} className="w-full max-w-[240px]">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                <Pie
                  data={pieRows}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {pieRows.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--background)" strokeWidth={1} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} работ`, '']} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            </div>
            <ul className="text-xs text-muted-foreground">
              {pieRows.map((r) => (
                <li key={r.name}>
                  <span className="font-medium text-foreground">{r.name}:</span> {r.value}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
