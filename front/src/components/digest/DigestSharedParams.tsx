import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { DigestFormState } from '@/hooks/useDigestFormState'
import type { DigestMode } from '@/types/api'

type DigestSharedParamsProps = {
  form: DigestFormState
  idPrefix?: string
  eyebrow?: string
  title?: string
  description?: string
  topicLabel?: string
}

export function DigestSharedParams({
  form,
  idPrefix = 'shared',
  eyebrow = 'Research Assistant',
  title = 'Что хотите изучить?',
  description = 'Введите тему, а KamGU соберёт корпус, отберёт ключевые работы и подготовит RU/EN дайджест.',
  topicLabel = 'Тема исследования',
}: DigestSharedParamsProps) {
  const modeId = `${idPrefix}-digest-mode`
  const primaryTopic = form.topics[0] ?? ''

  return (
    <Card className="overflow-hidden border-border/70 bg-card/92 shadow-sm">
      <CardContent className="space-y-7 p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-primary-topic`}>{topicLabel}</Label>
              <Input
                id={`${idPrefix}-primary-topic`}
                value={primaryTopic}
                onChange={(e) => form.setTopic(0, e.target.value)}
                className="h-13 text-base sm:text-lg"
                placeholder="Large Language Models"
              />
            </div>
            <div className="inline-flex w-fit rounded-lg border border-border bg-background p-1">
              <Button
                type="button"
                variant={form.digestMode === 'peer_reviewed' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => form.setDigestMode('peer_reviewed')}
              >
                Статьи
              </Button>
              <Button
                type="button"
                variant={form.digestMode === 'web_snippets' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => form.setDigestMode('web_snippets')}
              >
                Web
              </Button>
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-border/80 bg-muted/20 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Поиск</span>
              <span className="font-medium text-foreground">
                {form.digestMode === 'web_snippets' ? 'Web' : 'OpenAlex'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Отбор</span>
              <span className="font-medium text-foreground">{form.topN || 20} работ</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Языки</span>
              <span className="font-medium text-foreground">RU + EN</span>
            </div>
          </div>
        </div>

        {form.digestMode === 'web_snippets' ? (
          <>
            <Alert className="border-primary/25 bg-primary/5">
              <AlertTitle>Веб-обзор</AlertTitle>
              <AlertDescription>
                Короткие сниппеты через Tavily и отдельный дисклеймер. На сервере должен быть ключ Tavily.
              </AlertDescription>
            </Alert>
            <div className="space-y-4 rounded-lg border border-border/80 bg-muted/15 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <Label htmlFor={`${idPrefix}-web-scholarly`} className="text-sm font-medium">
                    Только научные сайты
                  </Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    По умолчанию Tavily ограничен академическими доменами.
                  </p>
                </div>
                <Switch
                  id={`${idPrefix}-web-scholarly`}
                  checked={form.webScholarlyOnly}
                  onCheckedChange={form.setWebScholarlyOnly}
                  className="shrink-0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-web-extra`}>Дополнительные ключевые слова (через запятую)</Label>
                <Input
                  id={`${idPrefix}-web-extra`}
                  value={form.webExtraTerms}
                  onChange={(e) => form.setWebExtraTerms(e.target.value)}
                  placeholder="например: battery, review"
                />
              </div>
            </div>
          </>
        ) : null}

        <details className="group rounded-lg border border-border/80 bg-muted/15">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>Показать параметры</span>
            <span className="text-xs text-muted-foreground group-open:hidden">Годы, лимиты, режим источников</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">Скрыть</span>
          </summary>
          <div className="space-y-6 border-t border-border/70 p-4">
            <div className="space-y-2">
              <Label htmlFor={modeId}>Режим источников</Label>
              <Select
                value={form.digestMode}
                onValueChange={(v) => form.setDigestMode(v as DigestMode)}
              >
                <SelectTrigger id={modeId} className="h-auto min-h-10 w-full max-w-xl py-2 whitespace-normal">
                  <SelectValue placeholder="Режим" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peer_reviewed">Рецензируемый корпус (OpenAlex и др.)</SelectItem>
                  <SelectItem value="web_snippets">Веб-обзор по сниппетам (Tavily)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.digestMode === 'peer_reviewed' ? (
              <Alert className="border-primary/25 bg-primary/5">
                <AlertTitle>Подсказка для OpenAlex</AlertTitle>
                <AlertDescription className="text-pretty">
                  Лучше работают короткие фразы по сути темы. Для точности добавьте английский вариант отдельной строкой.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label>Дополнительные поисковые строки</Label>
              <p className="text-xs text-muted-foreground">
                Одна строка — один вариант темы, например RU и EN формулировка.
              </p>
              {form.topics.map((t, i) => (
                <div key={i} className={i === 0 ? 'hidden' : 'flex gap-2'}>
                  <Input
                    value={t}
                    onChange={(e) => form.setTopic(i, e.target.value)}
                    placeholder="Тема"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => form.removeTopic(i)}
                    disabled={form.topics.length <= 1}
                    aria-label="Удалить строку"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={form.addTopic}>
                Добавить строку
              </Button>
            </div>

            {form.digestMode === 'peer_reviewed' ? (
              <div className="space-y-4 rounded-lg border border-border/80 bg-background/55 p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`${idPrefix}-fetch-oa`}
                    checked={form.fetchOaFulltext}
                    onCheckedChange={(c) => form.setFetchOaFulltext(c === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor={`${idPrefix}-fetch-oa`} className="cursor-pointer text-sm font-medium leading-snug">
                      OA-полнотекст по DOI (Unpaywall)
                    </Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Для открытых статей подтягивается текст PDF для модели.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-background/55 p-4">
              <Checkbox
                id={`${idPrefix}-deep`}
                checked={form.deepDigest}
                onCheckedChange={(c) => form.setDeepDigest(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-deep`} className="cursor-pointer text-sm font-medium leading-snug">
                  Глубокий дайджест
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Кратко по каждому источнику, затем сводка. Дольше и больше вызовов к модели.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-max-c`}>Макс. найденных статей (10–200)</Label>
            <Input
              id={`${idPrefix}-max-c`}
              type="number"
              min={10}
              max={200}
              value={form.maxCandidates}
              onChange={(e) => form.setMaxCandidates(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-top-n`}>Статей в итоговом обзоре (3–40)</Label>
            <Input
              id={`${idPrefix}-top-n`}
              type="number"
              min={3}
              max={40}
              value={form.topN}
              onChange={(e) => form.setTopN(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-trend-k`}>Размер списка лидеров для трендов (5–60)</Label>
            <Input
              id={`${idPrefix}-trend-k`}
              type="number"
              min={5}
              max={60}
              value={form.trendTopK}
              onChange={(e) => form.setTrendTopK(e.target.value)}
            />
          </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-from-y`}>Год от</Label>
            <Input
              id={`${idPrefix}-from-y`}
              type="number"
              min={1900}
              max={2100}
              value={form.fromYear}
              onChange={(e) => form.setFromYear(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-to-y`}>Год до</Label>
            <Input
              id={`${idPrefix}-to-y`}
              type="number"
              min={1900}
              max={2100}
              value={form.toYear}
              onChange={(e) => form.setToYear(e.target.value)}
            />
          </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-exclude`}>Исключить DOI</Label>
              <Textarea
                id={`${idPrefix}-exclude`}
                value={form.excludeDois}
                onChange={(e) => form.setExcludeDois(e.target.value)}
                rows={2}
                placeholder="10.1234/..."
              />
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
