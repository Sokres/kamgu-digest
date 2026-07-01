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
import {
  AnalyticsUpIcon,
  BookSearchIcon,
  Bookmark01Icon,
  Logout01Icon,
  PresentationBarChart01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { DIGEST_TAB_SUBTITLES } from '@/lib/digestTabs'

const ROUTE_META: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Новый дайджест',
    subtitle: 'Сформируйте обзор поля из темы, корпуса публикаций и LLM-сводки',
  },
  '/trends': {
    title: 'Тренды',
    subtitle: 'События, динамика и изменения научных направлений',
  },
  '/monitoring': {
    title: 'Мониторинг',
    subtitle: 'Снимки направлений, расписания и сравнение периодов',
  },
  '/saved': {
    title: 'Research History',
    subtitle: 'Архив исследований, сохранённые темы и результаты',
  },
}

const MAIN_NAV = [
  { to: '/', end: true, label: 'Дайджест', shortLabel: 'Дайджест', icon: BookSearchIcon },
  { to: '/monitoring', label: 'Мониторинг', shortLabel: 'Монитор.', icon: PresentationBarChart01Icon },
  { to: '/saved', label: 'Архив', shortLabel: 'Архив', icon: Bookmark01Icon },
  { to: '/trends', label: 'Тренды', shortLabel: 'Тренды', icon: AnalyticsUpIcon },
] as const

function routeMeta(pathname: string): { title: string; subtitle: string } {
  if (pathname === '/') {
    return {
      title: 'Новый дайджест',
      subtitle: DIGEST_TAB_SUBTITLES.once,
    }
  }
  if (pathname === '/saved' || pathname.startsWith('/saved/')) {
    return pathname === '/saved'
      ? ROUTE_META['/saved']
      : {
          title: 'Сохранённый дайджест',
          subtitle: 'Просмотр записи из архива',
        }
  }
  return ROUTE_META[pathname] ?? ROUTE_META['/']
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
        Сервис…
      </Badge>
    )
  }
  if (healthOk) {
    return (
      <Badge variant="default" className="border-0 bg-emerald-600/90 font-normal text-white hover:bg-emerald-600">
        Связь OK
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="font-normal">
      Недоступен
    </Badge>
  )
}

const sidebarNavClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
  )

const mobileNavClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] leading-tight font-medium transition-colors',
    isActive ? 'text-primary' : 'text-muted-foreground',
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
  const meta = routeMeta(location.pathname)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background md:flex-row">
      <aside className="hidden shrink-0 flex-col border-sidebar-border bg-sidebar print:hidden md:sticky md:top-0 md:flex md:h-screen md:w-[260px] md:border-r">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm">
            <span className="text-sm font-bold tracking-tight text-primary-foreground">K</span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              KamGU Research Digest
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Assistant</div>
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Основное меню">
          {MAIN_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} className={sidebarNavClass}>
              <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-[18px] opacity-90" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-sidebar-border p-3">
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
      </aside>

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border/60 bg-background px-4 py-3 md:hidden print:hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary shadow-sm">
            <span className="text-xs font-bold text-primary-foreground">K</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{meta.title}</div>
          </div>
          <HealthBadge key={apiBase} apiBase={apiBase} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label="Настройки"
            onClick={() => setSettingsOpen(true)}
          >
            <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-[18px]" />
          </Button>
          {authEnabled ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label="Выйти"
              onClick={handleLogout}
            >
              <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} className="size-[18px]" />
            </Button>
          ) : null}
        </div>

        <header className="hidden shrink-0 flex-wrap items-center gap-3 border-b border-border/60 bg-background/75 px-6 py-3 backdrop-blur-md supports-backdrop-filter:bg-background/55 md:sticky md:top-0 md:z-30 md:flex print:hidden print:border-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{meta.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.subtitle}</p>
          </div>
          <div className="hidden min-w-0 max-w-[min(420px,40vw)] items-center gap-2 sm:flex">
            <span
              className="truncate rounded-md border border-border/80 bg-muted/30 px-2 py-1 font-mono text-[10px] text-muted-foreground"
              title={apiBase}
            >
              {apiBase}
            </span>
          </div>
          <HealthBadge key={`desktop-${apiBase}`} apiBase={apiBase} />
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

        <main className="flex-1 px-4 py-6 pb-24 md:px-6 md:py-8 md:pb-8 print:px-4 print:py-4">{children}</main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_oklch(0_0_0/0.06)] backdrop-blur-md md:hidden print:hidden"
          aria-label="Основное меню"
        >
          <div className="grid grid-cols-4">
            {MAIN_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false} className={mobileNavClass}>
                <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-5 shrink-0" />
                <span className="max-w-full truncate text-center">{item.shortLabel}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} onSaved={onApiBaseChange} />
    </div>
  )
}
