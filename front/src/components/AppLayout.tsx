import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import { SettingsSheet } from '@/components/SettingsSheet'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { fetchHealth } from '@/lib/api'
import { cn } from '@/lib/utils'
import { HugeiconsIcon } from '@hugeicons/react'
import { BookSearchIcon, Calendar03Icon, PresentationBarChart01Icon, Settings02Icon } from '@hugeicons/core-free-icons'

const ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Дайджест',
    subtitle: 'Разовый обзор литературы по темам — текст RU/EN и список источников',
  },
  '/monthly': {
    title: 'Периодический',
    subtitle: 'Снимок в БД и сравнение с прошлым периодом; частота запусков задаётся планировщиком снаружи',
  },
  '/trends': {
    title: 'Тренды',
    subtitle: 'История снимков по profile_id и динамика размера топа по периодам',
  },
}

function HealthBadge({ apiBase }: { apiBase: string }) {
  const [healthOk, setHealthOk] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    fetchHealth(apiBase)
      .then(() => {
        if (alive) setHealthOk(true)
      })
      .catch(() => {
        if (alive) setHealthOk(false)
      })
    return () => {
      alive = false
    }
  }, [apiBase])

  if (healthOk === null) {
    return (
      <Badge variant="secondary" className="font-normal">
        API…
      </Badge>
    )
  }
  if (healthOk) {
    return (
      <Badge variant="default" className="border-0 bg-emerald-600/90 font-normal text-white hover:bg-emerald-600">
        API OK
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="font-normal">
      Недоступен
    </Badge>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
  )

export function AppLayout(props: {
  apiBase: string
  onApiBaseChange: (url: string) => void
  children: React.ReactNode
}) {
  const { apiBase, onApiBaseChange, children } = props
  const [settingsOpen, setSettingsOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { authEnabled, username, logout } = useAuth()
  const meta = ROUTE_META[location.pathname] ?? ROUTE_META['/']

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar print:hidden md:sticky md:top-0 md:h-screen md:w-[260px] md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-5 py-4 md:py-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary to-primary/70 shadow-sm">
            <span className="text-sm font-bold tracking-tight text-primary-foreground">K</span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">KamGU Digest</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Research</div>
          </div>
        </div>

        <Separator className="hidden bg-sidebar-border md:block" />

        <nav className="flex flex-1 flex-row gap-1 px-3 pb-3 md:flex-col md:gap-0.5 md:p-3 md:pb-0" aria-label="Основное меню">
          <NavLink
            to="/"
            end
            className={(p) => cn(navClass(p), 'flex-1 justify-center md:flex-none md:justify-start')}
          >
            <HugeiconsIcon icon={BookSearchIcon} strokeWidth={2} className="size-[18px] opacity-90" />
            Дайджест
          </NavLink>
          <NavLink to="/monthly" className={(p) => cn(navClass(p), 'flex-1 justify-center md:flex-none md:justify-start')}>
            <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="size-[18px] opacity-90" />
            Периодический
          </NavLink>
          <NavLink to="/trends" className={(p) => cn(navClass(p), 'flex-1 justify-center md:flex-none md:justify-start')}>
            <HugeiconsIcon icon={PresentationBarChart01Icon} strokeWidth={2} className="size-[18px] opacity-90" />
            Тренды
          </NavLink>
        </nav>

        <div className="mt-auto hidden border-t border-sidebar-border p-3 md:block">
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full justify-start gap-3 px-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setSettingsOpen(true)}
          >
            <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-[18px]" />
            Настройки
          </Button>
        </div>

        <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={onApiBaseChange} />
      </aside>

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border/60 bg-background/75 px-6 py-3 backdrop-blur-md supports-backdrop-filter:bg-background/55 print:hidden print:border-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{meta.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.subtitle}</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex min-w-0 max-w-[min(420px,40vw)]">
            <span className="truncate rounded-md border border-border/80 bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground" title={apiBase}>
              {apiBase}
            </span>
          </div>
          <HealthBadge key={apiBase} apiBase={apiBase} />
          {authEnabled ? (
            <div className="flex max-w-[min(280px,45vw)] shrink-0 items-center gap-2">
              <span className="hidden truncate text-sm text-muted-foreground sm:inline" title={username ?? ''}>
                {username ?? '—'}
              </span>
              <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={handleLogout}>
                Выйти
              </Button>
            </div>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setSettingsOpen(true)}>
            Настройки
          </Button>
        </header>

        <main className="flex-1 px-6 py-8 print:px-4 print:py-4">{children}</main>
      </div>
    </div>
  )
}
