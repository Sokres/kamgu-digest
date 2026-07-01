import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrendAnalysisResponse } from "@/types/api";

type TrendAnalysisPanelProps = {
  loading: boolean;
  error: string | null;
  analysis: TrendAnalysisResponse | null;
  snapshotCount: number;
  onRefresh: () => void;
  refreshing: boolean;
};

export function TrendAnalysisPanel({
  loading,
  error,
  analysis,
  snapshotCount,
  onRefresh,
  refreshing,
}: TrendAnalysisPanelProps) {
  const canAnalyze = snapshotCount >= 2;
  const hasText = Boolean(analysis?.analysis_ru?.trim());

  return (
    <Card className="border-primary/20 bg-linear-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>ИИ-анализ направления</CardTitle>
            <CardDescription className="text-pretty">
              Сводная интерпретация динамики по всем сохранённым периодам. Текст
              формирует LLM-агент на основе структурированных метрик.
            </CardDescription>
          </div>
          {canAnalyze ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={loading || refreshing}
              onClick={onRefresh}
            >
              {refreshing ? "Анализ…" : "Обновить анализ"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !canAnalyze ? (
          <p className="text-sm text-muted-foreground text-pretty">
            Накопите минимум 2 периода, чтобы получить сравнительный анализ.
            Сейчас периодов: {snapshotCount}.
          </p>
        ) : !hasText ? (
          <p className="text-sm text-muted-foreground">
            Анализ ещё не сформирован. Нажмите «Обновить анализ» или дождитесь
            автоматического запуска.
          </p>
        ) : (
          <>
            {analysis?.cached ? (
              <p className="text-xs text-muted-foreground">
                Кэш актуален для периода{" "}
                {analysis.analyzed_through_period ?? "—"}.
              </p>
            ) : analysis?.analyzed_through_period ? (
              <p className="text-xs text-muted-foreground">
                Сформировано для периода {analysis.analyzed_through_period}.
              </p>
            ) : null}
            <ScrollArea className="h-[min(560px,65vh)] w-full rounded-md border">
              <div className="digest-prose mx-auto max-w-prose p-4 md:p-6">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {analysis?.analysis_ru || "—"}
                </pre>
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
