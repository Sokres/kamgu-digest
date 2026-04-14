import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ApiError, authLogin, authRegister } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { getApiBaseUrl, setApiBaseUrl } from '@/lib/settings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { applyThemeFromPreference } from '@/lib/settings'

type LocationState = { from?: { pathname: string } }

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { authEnabled, registrationEnabled, loading, isAuthenticated, loginWithToken, refreshStatus } = useAuth()
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/'

  useEffect(() => {
    if (loading) return
    if (authEnabled && isAuthenticated) {
      navigate(from, { replace: true })
    }
  }, [loading, authEnabled, isAuthenticated, navigate, from])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [apiEdit, setApiEdit] = useState(() => getApiBaseUrl())

  const apiBase = getApiBaseUrl()

  function applyApiUrl() {
    const t = apiEdit.trim().replace(/\/+$/, '') || 'http://localhost:8080'
    setApiBaseUrl(t)
    window.location.reload()
  }

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await authLogin(apiBase, { username: username.trim(), password })
      loginWithToken(res.access_token)
      applyThemeFromPreference()
      await refreshStatus()
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await authRegister(apiBase, { username: username.trim(), password })
      loginWithToken(res.access_token)
      applyThemeFromPreference()
      await refreshStatus()
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!loading && !authEnabled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle>Вход недоступен</CardTitle>
            <CardDescription>
              На сервере <span className="font-mono text-xs">{apiBase}</span> не включена авторизация (
              <code className="text-xs">AUTH_ENABLED</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Задайте в <code className="text-xs">.env</code> бэкенда:{' '}
              <code className="text-xs">AUTH_ENABLED=true</code> и <code className="text-xs">AUTH_JWT_SECRET</code>, затем перезапустите API.
            </p>
            <Button asChild className="w-full">
              <Link to="/">На главную</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-b from-muted/40 to-background px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-primary/70 shadow-md">
          <span className="text-lg font-bold text-primary-foreground">K</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">KamGU Digest</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Войдите, чтобы работать со своими снимками, трендами и PDF.</p>
      </div>

      <Card className="w-full max-w-md border-border/80 shadow-xl">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-xl">Аккаунт</CardTitle>
          <CardDescription className="font-mono text-xs">
            API: <span className="text-foreground">{apiBase}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <details className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Другой адрес API (редко нужно)
            </summary>
            <div className="mt-3 space-y-2">
              <Label htmlFor="login-api" className="text-xs text-muted-foreground">
                Укажите URL бэкенда и нажмите «Применить» (страница перезагрузится)
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="login-api"
                  className="font-mono text-xs"
                  value={apiEdit}
                  onChange={(e) => setApiEdit(e.target.value)}
                  placeholder={apiBase}
                  autoComplete="off"
                />
                <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={applyApiUrl}>
                  Применить
                </Button>
              </div>
            </div>
          </details>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Проверка сервера…</p>
          ) : registrationEnabled ? (
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Вход</TabsTrigger>
                <TabsTrigger value="register">Регистрация</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-4 space-y-4">
                <form onSubmit={submitLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-user">Имя пользователя</Label>
                    <Input
                      id="login-user"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-pass">Пароль</Label>
                    <Input
                      id="login-pass"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {error ? (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? 'Вход…' : 'Войти'}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="register" className="mt-4 space-y-4">
                <form onSubmit={submitRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-user">Имя пользователя</Label>
                    <Input
                      id="reg-user"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      minLength={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-pass">Пароль (не короче 8 символов)</Label>
                    <Input
                      id="reg-pass"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  {error ? (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? 'Создание…' : 'Создать аккаунт'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          ) : (
            <form onSubmit={submitLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-user-only">Имя пользователя</Label>
                <Input
                  id="login-user-only"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-pass-only">Пароль</Label>
                <Input
                  id="login-pass-only"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <p className="text-xs text-muted-foreground">Регистрация на сервере отключена — только вход существующих пользователей.</p>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Вход…' : 'Войти'}
              </Button>
            </form>
          )}
          <p className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
            Сессия хранится в этом браузере. После входа адрес API можно сменить в настройках.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
