export function digestSnapshotHref(profileId?: string): string {
  const params = new URLSearchParams()
  const pid = profileId?.trim()
  if (pid) params.set('profile', pid)
  const query = params.toString()
  return query ? `/monitoring?${query}` : '/monitoring'
}
