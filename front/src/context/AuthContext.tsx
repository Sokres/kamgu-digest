import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { ApiError, authLogout, authRefresh, fetchAuthMe, fetchAuthStatus } from '@/lib/api'
import {
  clearAccessToken,
  clearRefreshToken,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '@/lib/settings'

export type AuthUser = { userId: string; username: string }

export type AuthContextValue = {
  loading: boolean
  authEnabled: boolean
  registrationEnabled: boolean
  isAuthenticated: boolean
  user: AuthUser | null
  username: string | null
  refreshSession: () => Promise<void>
  loginWithTokens: (accessToken: string, refreshToken: string, profile: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider(props: { apiBase: string; children: React.ReactNode }) {
  const { apiBase, children } = props
  const [loading, setLoading] = useState(true)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

  const refreshSession = useCallback(async () => {
    setLoading(true)
    try {
      const s = await fetchAuthStatus(apiBase)
      setAuthEnabled(s.auth_enabled)
      setRegistrationEnabled(s.registration_enabled)
      if (!s.auth_enabled) {
        setUser(null)
        return
      }
      const token = getAccessToken().trim()
      if (!token) {
        setUser(null)
        return
      }
      try {
        const me = await fetchAuthMe(apiBase)
        setUser({ userId: me.user_id, username: me.username })
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          const rt = getRefreshToken().trim()
          if (rt) {
            try {
              const t = await authRefresh(apiBase, rt)
              setAccessToken(t.access_token)
              setRefreshToken(t.refresh_token)
              const me = await fetchAuthMe(apiBase)
              setUser({ userId: me.user_id, username: me.username })
            } catch {
              clearAccessToken()
              clearRefreshToken()
              setUser(null)
            }
          } else {
            clearAccessToken()
            setUser(null)
          }
        } else {
          clearAccessToken()
          clearRefreshToken()
          setUser(null)
        }
      }
    } catch {
      setAuthEnabled(false)
      setRegistrationEnabled(false)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const loginWithTokens = useCallback((accessToken: string, refreshToken: string, profile: AuthUser) => {
    setAccessToken(accessToken)
    setRefreshToken(refreshToken)
    setUser(profile)
  }, [])

  const logout = useCallback(() => {
    const rt = getRefreshToken().trim()
    void authLogout(apiBase, {
      refreshToken: rt || undefined,
    }).catch(() => {})
    clearAccessToken()
    clearRefreshToken()
    setUser(null)
  }, [apiBase])

  const value = useMemo<AuthContextValue>(() => {
    return {
      loading,
      authEnabled,
      registrationEnabled,
      isAuthenticated: Boolean(authEnabled && user),
      user,
      username: user?.username ?? null,
      refreshSession,
      loginWithTokens,
      logout,
    }
  }, [loading, authEnabled, registrationEnabled, user, refreshSession, loginWithTokens, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook must share context with AuthProvider
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
