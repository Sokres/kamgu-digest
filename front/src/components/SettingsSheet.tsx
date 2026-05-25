import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";
import { ApiError, authChangePassword } from "@/lib/api";
import {
  applyThemeFromPreference,
  clearLlmClientOverride,
  clearRefreshToken,
  getApiBaseUrl,
  getLlmClientApiKey,
  getLlmClientBaseUrl,
  getLlmClientJsonMode,
  getLlmClientModel,
  getLlmPresetId,
  getMonthlyInternalKey,
  getThemePreference,
  LLM_PRESET_OPTIONS,
  LLM_PRESET_PRICING_LABEL,
  LLM_PRESET_PRICING_LEGEND,
  setApiBaseUrl,
  setLlmClientApiKey,
  setLlmClientBaseUrl,
  setLlmClientJsonMode,
  setLlmClientModel,
  setLlmPresetId,
  setMonthlyInternalKey,
  setThemePreference,
  type LlmPresetId,
  type LlmPresetPricing,
  type ThemePreference,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

function llmPricingBadgeClass(pricing: LlmPresetPricing): string {
  switch (pricing) {
    case "free_local":
      return "border-emerald-500/45 bg-emerald-500/12 text-emerald-950 dark:text-emerald-100";
    case "free_quota":
      return "border-amber-500/45 bg-amber-500/12 text-amber-950 dark:text-amber-100";
    case "paid":
      return "border-border bg-muted/60 text-foreground";
    case "depends":
      return "border-border text-muted-foreground";
  }
}

function LlmPricingBadge(props: { pricing: LlmPresetPricing }) {
  const { pricing } = props;
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 shrink-0 px-1.5 text-[10px] font-medium whitespace-nowrap",
        llmPricingBadgeClass(pricing),
      )}
    >
      {LLM_PRESET_PRICING_LABEL[pricing]}
    </Badge>
  );
}

export function SettingsSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (apiBaseUrl: string) => void;
}) {
  const { open, onOpenChange, onSaved } = props;
  const { loading: authLoading, authEnabled, isAuthenticated } = useAuth();
  const [url, setUrl] = useState(() => getApiBaseUrl());
  const [monthlyKey, setMonthlyKey] = useState(() => getMonthlyInternalKey());
  const [theme, setTheme] = useState<ThemePreference>(() =>
    getThemePreference(),
  );
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [llmPreset, setLlmPreset] = useState<LlmPresetId>(() =>
    getLlmPresetId(),
  );
  const [llmKey, setLlmKey] = useState(() => getLlmClientApiKey());
  const [llmBase, setLlmBase] = useState(() => getLlmClientBaseUrl());
  const [llmModel, setLlmModel] = useState(() => getLlmClientModel());
  const [llmJson, setLlmJson] = useState(() => getLlmClientJsonMode());

  function applyLlmPreset(id: LlmPresetId) {
    setLlmPreset(id);
    const p = LLM_PRESET_OPTIONS.find((o) => o.id === id);
    if (!p) return;
    if (id === "server") {
      setLlmKey("");
      setLlmBase("");
      setLlmModel("");
      return;
    }
    if (id !== "custom") {
      setLlmBase(p.baseUrl);
      setLlmModel(p.model);
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setUrl(getApiBaseUrl());
      setMonthlyKey(getMonthlyInternalKey());
      setTheme(getThemePreference());
      setCurPwd("");
      setNewPwd("");
      setNewPwd2("");
      setPwdMsg(null);
      setPwdErr(null);
      setLlmPreset(getLlmPresetId());
      setLlmKey(getLlmClientApiKey());
      setLlmBase(getLlmClientBaseUrl());
      setLlmModel(getLlmClientModel());
      setLlmJson(getLlmClientJsonMode());
    }
    onOpenChange(next);
  }

  async function submitPasswordChange() {
    setPwdErr(null);
    setPwdMsg(null);
    if (newPwd !== newPwd2) {
      setPwdErr("Новый пароль и повтор не совпадают.");
      return;
    }
    setPwdBusy(true);
    try {
      await authChangePassword(getApiBaseUrl(), {
        current_password: curPwd,
        new_password: newPwd,
      });
      clearRefreshToken();
      setPwdMsg("Пароль обновлён.");
      setCurPwd("");
      setNewPwd("");
      setNewPwd2("");
    } catch (e) {
      setPwdErr(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setPwdBusy(false);
    }
  }

  function save() {
    const trimmed = url.trim().replace(/\/+$/, "") || "http://localhost:8080";
    setApiBaseUrl(trimmed);
    setMonthlyInternalKey(monthlyKey);
    setThemePreference(theme);
    applyThemeFromPreference();
    if (llmPreset === "server") {
      clearLlmClientOverride();
    } else {
      setLlmPresetId(llmPreset);
      setLlmClientApiKey(llmKey);
      setLlmClientBaseUrl(llmBase);
      setLlmClientModel(llmModel);
      setLlmClientJsonMode(llmJson);
    }
    onSaved(trimmed);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 space-y-2 border-b border-border/80 px-6 py-5">
          <SheetTitle>Настройки</SheetTitle>
          <SheetDescription className="text-pretty">
            Адрес API, при необходимости — сервисный ключ для автоматических запусков, свой ключ нейросети (BYOK) и
            пресет модели. Вход в аккаунт — на странице «Вход».
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          <div className="flex flex-col gap-6">
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
              <Label htmlFor="monthly-key">Сервисный ключ (периодический дайджест, расписание, подписи в трендах)</Label>
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
              <Select
                value={theme}
                onValueChange={(v) => setTheme(v as ThemePreference)}
              >
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
            <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-4">
              <p className="text-sm font-medium">Нейросеть (свой ключ)</p>
              <p className="text-xs text-muted-foreground text-pretty">
                Ключ хранится только в этом браузере. Для запросов дайджеста он передаётся на сервер отдельными
                служебными заголовками; значение ключа на сервере в лог не пишется. Для бесплатных моделей OpenRouter при
                ошибке JSON отключите «JSON-режим».
              </p>
              <p className="text-xs text-muted-foreground text-pretty">
                {LLM_PRESET_PRICING_LEGEND}
              </p>
              <div className="space-y-2">
                <Label htmlFor="llm-preset">Провайдер / модель</Label>
                <Select
                  value={llmPreset}
                  onValueChange={(v) => applyLlmPreset(v as LlmPresetId)}
                >
                  <SelectTrigger id="llm-preset" className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LLM_PRESET_OPTIONS.map((o) => (
                      <SelectItem
                        key={o.id}
                        value={o.id}
                        textValue={`${o.label} ${LLM_PRESET_PRICING_LABEL[o.pricing]}`}
                      >
                        <span className="flex w-full min-w-0 items-center justify-between gap-2">
                          <span className="min-w-0 truncate">{o.label}</span>
                          <LlmPricingBadge pricing={o.pricing} />
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {LLM_PRESET_OPTIONS.find((o) => o.id === llmPreset)
                  ?.description ? (
                  <p className="text-xs text-muted-foreground text-pretty">
                    {
                      LLM_PRESET_OPTIONS.find((o) => o.id === llmPreset)
                        ?.description
                    }
                  </p>
                ) : null}
              </div>
              {llmPreset !== "server" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="llm-key">API-ключ</Label>
                    <Input
                      id="llm-key"
                      type="password"
                      value={llmKey}
                      onChange={(e) => setLlmKey(e.target.value)}
                      placeholder="sk-or-v1-… или sk-…"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="llm-base">
                      Base URL API (необязательно для sk-or-v1 на OpenRouter)
                    </Label>
                    <Input
                      id="llm-base"
                      value={llmBase}
                      onChange={(e) => setLlmBase(e.target.value)}
                      placeholder="https://openrouter.ai/api/v1"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="llm-model">Идентификатор модели</Label>
                    <Input
                      id="llm-model"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      placeholder="openai/gpt-4o-mini"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                    <div className="space-y-0.5">
                      <Label htmlFor="llm-json" className="text-sm font-normal">
                        JSON-режим ответа (response_format)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Выключите для части :free и кастомных моделей.
                      </p>
                    </div>
                    <Switch
                      id="llm-json"
                      checked={llmJson}
                      onCheckedChange={setLlmJson}
                    />
                  </div>
                </>
              ) : null}
            </div>
            {!authLoading && authEnabled && isAuthenticated ? (
              <div className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-4">
                <p className="text-sm font-medium">Смена пароля</p>
                <div className="space-y-2">
                  <Label htmlFor="set-cur-pwd">Текущий пароль</Label>
                  <Input
                    id="set-cur-pwd"
                    type="password"
                    value={curPwd}
                    onChange={(e) => setCurPwd(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="set-new-pwd">
                    Новый пароль (не короче 8 символов)
                  </Label>
                  <Input
                    id="set-new-pwd"
                    type="password"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="set-new-pwd2">Повтор нового пароля</Label>
                  <Input
                    id="set-new-pwd2"
                    type="password"
                    value={newPwd2}
                    onChange={(e) => setNewPwd2(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                {pwdErr ? (
                  <p className="text-sm text-destructive">{pwdErr}</p>
                ) : null}
                {pwdMsg ? (
                  <p className="text-sm text-muted-foreground">{pwdMsg}</p>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pwdBusy || !curPwd || !newPwd || !newPwd2}
                  onClick={() => void submitPasswordChange()}
                >
                  {pwdBusy ? "Сохранение…" : "Сменить пароль"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        <SheetFooter className="shrink-0 gap-3 border-t border-border/80 bg-popover px-6 py-4 sm:flex-row sm:justify-start">
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
  );
}
