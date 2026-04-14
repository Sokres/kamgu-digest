import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/context/AuthContext'

/** При AUTH_ENABLED на сервере перенаправляет на /login, пока нет токена. */
export function RequireAuth() {
  const { loading, authEnabled, isAuthenticated } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background text-muted-foreground">
        <div className="size-8 animate-pulse rounded-full bg-primary/30" aria-hidden />
        <p className="text-sm">Проверка сессии…</p>
      </div>
    )
  }

  if (!authEnabled) {
    return <Outlet />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
