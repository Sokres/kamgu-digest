export function digestSnapshotHref(profileId?: string): string {
  const params = new URLSearchParams({ tab: 'snapshot' })
  const pid = profileId?.trim()
  if (pid) params.set('profile', pid)
  return `/?${params.toString()}`
}
