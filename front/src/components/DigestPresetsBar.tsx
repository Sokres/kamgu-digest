import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  deleteDigestPreset,
  loadDigestPresets,
  upsertDigestPreset,
  type DigestFormPreset,
} from '@/lib/digestPresets'

export function DigestPresetsBar(props: {
  onApply: (p: DigestFormPreset) => void
  snapshot: Omit<DigestFormPreset, 'id' | 'name' | 'updatedAt'>
}) {
  const { onApply, snapshot } = props
  const [presets, setPresets] = useState(() => loadDigestPresets())
  const [selectedId, setSelectedId] = useState<string>('')
  const [presetName, setPresetName] = useState('')

  const selected = useMemo(() => presets.find((p) => p.id === selectedId), [presets, selectedId])

  function refresh() {
    setPresets(loadDigestPresets())
  }

  function handleApply() {
    if (!selected) return
    onApply(selected)
  }

  function handleSave() {
    const name = presetName.trim()
    if (!name) return
    const saved = upsertDigestPreset({
      ...snapshot,
      name,
      id: selectedId || undefined,
    })
    setPresetName('')
    setSelectedId(saved.id)
    refresh()
  }

  function handleDelete() {
    if (!selectedId) return
    deleteDigestPreset(selectedId)
    setSelectedId('')
    refresh()
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-4">
      <div>
        <Label className="text-sm font-medium">Пресеты параметров</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Сохраняются в браузере (localStorage). Удобно для повторяющихся направлений.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select
          value={selectedId || undefined}
          onValueChange={(v) => setSelectedId(v)}
        >
          <SelectTrigger className="w-[min(100%,280px)]">
            <SelectValue placeholder="Выберите пресет" />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="secondary" size="sm" onClick={handleApply} disabled={!selected}>
          Применить
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleDelete} disabled={!selectedId}>
          Удалить
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Имя пресета"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          className="max-w-sm"
        />
        <Button type="button" size="sm" onClick={handleSave} disabled={!presetName.trim()}>
          Сохранить текущие параметры
        </Button>
      </div>
    </div>
  )
}
