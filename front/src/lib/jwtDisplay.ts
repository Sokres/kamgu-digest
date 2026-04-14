/** Декодирование поля `u` (username) из JWT payload без проверки подписи — только для отображения. */
export function jwtUsernameFromToken(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const pad = parts[1].padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '=')
    const json = atob(pad.replace(/-/g, '+').replace(/_/g, '/'))
    const p = JSON.parse(json) as { u?: string }
    return typeof p.u === 'string' ? p.u : null
  } catch {
    return null
  }
}
