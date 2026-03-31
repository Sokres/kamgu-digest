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
import { getApiBaseUrl, getMonthlyInternalKey, setApiBaseUrl, setMonthlyInternalKey } from '@/lib/settings'

export function SettingsSheet(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (apiBaseUrl: string) => void
}) {
  const { open, onOpenChange, onSaved } = props
  const [url, setUrl] = useState(getApiBaseUrl)
  const [monthlyKey, setMonthlyKey] = useState(getMonthlyInternalKey)

  function handleOpenChange(next: boolean) {
    if (next) {
      setUrl(getApiBaseUrl())
      setMonthlyKey(getMonthlyInternalKey())
    }
    onOpenChange(next)
  }

  function save() {
    const trimmed = url.trim().replace(/\/+$/, '') || 'http://localhost:8080'
    setApiBaseUrl(trimmed)
    setMonthlyInternalKey(monthlyKey)
    onSaved(trimmed)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Настройки</SheetTitle>
          <SheetDescription>
            Базовый URL API и опциональный ключ для{' '}
            <code className="text-xs">POST /digests/periodic</code> (если на сервере задан секрет).
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
          <Label htmlFor="monthly-key">X-Internal-Key (периодический дайджест и подписи трендов)</Label>
          <Input
            id="monthly-key"
            value={monthlyKey}
            onChange={(e) => setMonthlyKey(e.target.value)}
            placeholder="если требуется бэкендом"
            autoComplete="off"
          />
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
