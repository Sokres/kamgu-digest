import { profileDisplayName } from '@/components/ProfileDirectionPicker'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TrendProfileSummary } from '@/types/api'
import { cn } from '@/lib/utils'

type TrendProfilesOverviewProps = {
  profiles: TrendProfileSummary[]
  selectedId: string | null
  onSelect: (profileId: string) => void
}

export function TrendProfilesOverview({
  profiles,
  selectedId,
  onSelect,
}: TrendProfilesOverviewProps) {
  if (profiles.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Обзор направлений</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => {
            const active = p.profile_id === selectedId
            return (
              <button
                key={p.profile_id}
                type="button"
                onClick={() => onSelect(p.profile_id)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  active
                    ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border/80 bg-muted/10 hover:bg-muted/25',
                )}
              >
                <p className="font-medium text-sm leading-snug">{profileDisplayName(p)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    периодов: {p.snapshot_count}
                  </Badge>
                  {p.last_period ? (
                    <Badge variant="outline" className="text-[10px] font-normal font-mono">
                      {p.last_period}
                    </Badge>
                  ) : null}
                  {p.work_count_last > 0 ? (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      топ: {p.work_count_last}
                    </Badge>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
