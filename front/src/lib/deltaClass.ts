import { cn } from '@/lib/utils'

/** Semantic color for signed deltas; not color-only — caller should still show sign. */
export function deltaSignedClass(value: number | null | undefined): string {
  if (value == null || value === 0 || Number.isNaN(value)) {
    return 'text-muted-foreground tabular-nums'
  }
  if (value > 0) {
    return 'text-emerald-700 dark:text-emerald-400 tabular-nums font-medium'
  }
  return 'text-red-700 dark:text-red-400 tabular-nums font-medium'
}

export function deltaCellProps(value: number | null | undefined): { className: string } {
  return { className: cn(deltaSignedClass(value)) }
}
