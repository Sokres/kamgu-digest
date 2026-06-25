import { cn } from '@/lib/utils'
import type { TrendProfileSummary } from '@/types/api'

export function profileDisplayName(p: TrendProfileSummary): string {
  const d = (p.display_name ?? '').trim()
  return d || p.profile_id
}

export function profileHasDisplayName(p: TrendProfileSummary): boolean {
  return (p.display_name ?? '').trim().length > 0
}

type ProfileDirectionPickerProps = {
  profiles: TrendProfileSummary[]
  selectedId: string
  onSelect: (profileId: string) => void
  disabled?: boolean
  emptyMessage?: string
}

export function ProfileDirectionPicker({
  profiles,
  selectedId,
  onSelect,
  disabled,
  emptyMessage = 'Пока нет направлений — создайте название ниже и нажмите «Создать направление».',
}: ProfileDirectionPickerProps) {
  if (!profiles.length) {
    return (
      <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-4 text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    )
  }

  return (
    <ul className="space-y-2" role="listbox" aria-label="Направления">
      {profiles.map((p) => {
        const selected = p.profile_id === selectedId
        return (
          <li key={p.profile_id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              className={cn(
                'w-full rounded-lg border p-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'border-primary bg-primary/8 shadow-sm'
                  : 'border-border/80 bg-background hover:bg-muted/40',
                disabled && 'pointer-events-none opacity-60',
              )}
              onClick={() => onSelect(p.profile_id)}
            >
              <div className="font-medium wrap-break-word text-pretty">{profileDisplayName(p)}</div>
              {profileHasDisplayName(p) ? (
                <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{p.profile_id}</div>
              ) : null}
              {(p.snapshot_count ?? 0) > 0 || p.last_period ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {p.snapshot_count != null ? `Периодов: ${p.snapshot_count}` : null}
                  {p.snapshot_count != null && p.last_period ? ' · ' : null}
                  {p.last_period ? `последний период ${p.last_period}` : null}
                </p>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
