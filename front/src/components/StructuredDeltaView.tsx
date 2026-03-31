import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { MonthlyStructuredDelta } from '@/types/api'

function CitationRows({
  rows,
  title,
}: {
  rows: NonNullable<MonthlyStructuredDelta['top_by_citation_gain']>
  title: string
}) {
  if (!rows.length) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead className="w-24">Δ цит.</TableHead>
              <TableHead className="w-20">Ранг был</TableHead>
              <TableHead className="w-20">Ранг сейчас</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.dedupe_key}>
                <TableCell className="max-w-md">{r.title}</TableCell>
                <TableCell>{r.citation_delta ?? '—'}</TableCell>
                <TableCell>{r.rank_previous ?? '—'}</TableCell>
                <TableCell>{r.rank_current ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ConceptTable({
  rows,
}: {
  rows: NonNullable<MonthlyStructuredDelta['concept_share_deltas']>
}) {
  if (!rows.length) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Доли концептов (OpenAlex)</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Концепт</TableHead>
              <TableHead className="w-24">Было</TableHead>
              <TableHead className="w-24">Стало</TableHead>
              <TableHead className="w-24">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.concept_name}>
                <TableCell>{r.concept_name}</TableCell>
                <TableCell>
                  {r.share_previous != null ? r.share_previous.toFixed(3) : '—'}
                </TableCell>
                <TableCell>
                  {r.share_current != null ? r.share_current.toFixed(3) : '—'}
                </TableCell>
                <TableCell>{r.delta != null ? r.delta.toFixed(3) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function StructuredDeltaView({ delta }: { delta: MonthlyStructuredDelta }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Период:</span>
        <Badge variant="secondary">{delta.current_period}</Badge>
        {delta.compared_period ? (
          <>
            <span className="text-sm text-muted-foreground">vs</span>
            <Badge variant="outline">{delta.compared_period}</Badge>
          </>
        ) : null}
        {delta.is_baseline ? (
          <Badge variant="default">Базовая линия (без сравнения)</Badge>
        ) : null}
      </div>

      <CitationRows rows={delta.top_by_citation_gain ?? []} title="Рост цитирования" />
      <CitationRows rows={delta.entered_top_k ?? []} title="Вошли в топ-K" />
      <CitationRows rows={delta.left_top_k ?? []} title="Вышли из топ-K" />
      <ConceptTable rows={delta.concept_share_deltas ?? []} />
    </div>
  )
}
