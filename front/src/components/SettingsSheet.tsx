import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  applyThemeFromPreference,
  getApiBaseUrl,
  getMonthlyInternalKey,
  getThemePreference,
  setApiBaseUrl,
  setMonthlyInternalKey,
  setThemePreference,
  type ThemePreference,
} from '@/lib/settings'

export function SettingsSheet(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (apiBaseUrl: string) => void
}) {
  const { open, onOpenChange, onSaved } = props
  const [url, setUrl] = useState(() => getApiBaseUrl())
  const [monthlyKey, setMonthlyKey] = useState(() => getMonthlyInternalKey())
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference())

  function handleOpenChange(next: boolean) {
    if (next) {
      setUrl(getApiBaseUrl())
      setMonthlyKey(getMonthlyInternalKey())
      setTheme(getThemePreference())
    }
    onOpenChange(next)
  }

  function save() {
    const trimmed = url.trim().replace(/\/+$/, '') || 'http://localhost:8080'
    setApiBaseUrl(trimmed)
    setMonthlyInternalKey(monthlyKey)
    setThemePreference(theme)
    applyThemeFromPreference()
    onSaved(trimmed)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Настройки</SheetTitle>
          <SheetDescription>
            Базовый URL API и опциональный ключ <code className="text-xs">X-Internal-Key</code> для cron и серверного
            секрета. Вход в аккаунт — на странице «Вход» (кнопка в шапке).
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2">
          <Label htmlFor="api-url">API base URL</Label>
          <Input
            id="api-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8080"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="monthly-key">X-Internal-Key (периодический дайджест, расписание, тренды)</Label>
          <Input
            id="monthly-key"
            value={monthlyKey}
            onChange={(e) => setMonthlyKey(e.target.value)}
            placeholder="если требуется бэкендом"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="theme-pref">Тема интерфейса</Label>
          <Select value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
            <SelectTrigger id="theme-pref" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">Как в системе</SelectItem>
              <SelectItem value="light">Светлая</SelectItem>
              <SelectItem value="dark">Тёмная</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <SheetFooter className="gap-2 sm:justify-start">
          <Button type="button" onClick={save}>
            Сохранить
          </Button>
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Отмена
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
