import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { fetchAuthStatus } from '@/lib/api'
import { jwtUsernameFromToken } from '@/lib/jwtDisplay'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/lib/settings'

export type AuthContextValue = {
  loading: boolean
  authEnabled: boolean
  registrationEnabled: boolean
  isAuthenticated: boolean
  username: string | null
  refreshStatus: () => Promise<void>
  loginWithToken: (accessToken: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider(props: { apiBase: string; children: React.ReactNode }) {
  const { apiBase, children } = props
  const [loading, setLoading] = useState(true)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [tokenVersion, setTokenVersion] = useState(0)

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    try {
      const s = await fetchAuthStatus(apiBase)
      setAuthEnabled(s.auth_enabled)
      setRegistrationEnabled(s.registration_enabled)
    } catch {
      setAuthEnabled(false)
      setRegistrationEnabled(false)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const loginWithToken = useCallback((accessToken: string) => {
    setAccessToken(accessToken)
    setTokenVersion((v) => v + 1)
  }, [])

  const logout = useCallback(() => {
    clearAccessToken()
    setTokenVersion((v) => v + 1)
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const t = getAccessToken().trim()
    const un = t ? jwtUsernameFromToken(t) : null
    return {
      loading,
      authEnabled,
      registrationEnabled,
      isAuthenticated: Boolean(authEnabled && t),
      username: un,
      refreshStatus,
      loginWithToken,
      logout,
    }
  }, [loading, authEnabled, registrationEnabled, tokenVersion, refreshStatus, loginWithToken, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
