"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "@/lib/router";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useSubjectLevelFilter } from "@/hooks/use-subject-level-filter";
import { usePageTitle } from "@/lib/page-context";
import {
  buildRetentionMeta,
  buildAverageRetentionSeries,
  type ProblemRetentionMeta,
} from "@/lib/retention-series";
import { formatMonthDay } from "@/lib/date-utils";
import { BarChart3, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ProblemWithAnswers } from "@/components/problem-card";

export default function StatsPage() {
  usePageTitle("Stats");
  const router = useRouter();
  const { currentProject } = useProject();
  const [metas, setMetas] = useState<ProblemRetentionMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);

  const fetchData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const res = await api.get<{ data: ProblemWithAnswers[] }>(
        `/problems-list?project_id=${currentProject.id}`,
      );
      const built: ProblemRetentionMeta[] = [];
      for (const p of res.data) {
        const m = buildRetentionMeta(
          p.id, p.code, p.name, p.subject_id, p.level_id,
          p.answers.map((a) => ({ date: a.date, status: a.status, point: a.point })),
          now,
        );
        if (m) built.push(m);
      }
      setMetas(built);
    } catch {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [currentProject, now]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useSubjectLevelFilter(metas, { subject: "subjectId", level: "levelId" });

  const avgSeries = useMemo(
    () => buildAverageRetentionSeries(filtered, now),
    [filtered, now],
  );

  const avgChartConfig: ChartConfig = {
    retention: { label: "平均保持率", color: "hsl(var(--chart-1))" },
  };

  if (!currentProject) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">Please select a project</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : avgSeries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No data</div>
      ) : (
        <Card
          className="cursor-pointer transition-colors hover:bg-card/90"
          onClick={() => router.push("/stats/retention")}
        >
          <CardHeader>
            <CardTitle className="text-sm font-medium">保持率推移</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={avgChartConfig} className="h-[200px] w-full">
              <AreaChart data={avgSeries} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatMonthDay} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} tickFormatter={(v) => `${v}%`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => [`${value}%`, "平均保持率"]} />} />
                <Area dataKey="retention" type="monotone" fill="hsl(var(--chart-1))" fillOpacity={0.2} stroke="hsl(var(--chart-1))" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
            <p className="text-xs text-muted-foreground mt-2">
              {filtered.length} 問題の平均 · クリックで詳細
            </p>
          </CardContent>
        </Card>
      )}

        {/* Score dashboard card */}
        {!loading && (
          <Card
            className="cursor-pointer transition-colors hover:bg-card/90"
            onClick={() => router.push("/stats/score")}
          >
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="size-4" />
                スコアダッシュボード
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                FSRS準拠のスコア計算・復習スケジュール · クリックで詳細
              </p>
            </CardContent>
          </Card>
        )}

        {/* Schedule card */}
        {!loading && (
          <Card
            className="cursor-pointer transition-colors hover:bg-card/90"
            onClick={() => router.push("/schedule")}
          >
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="size-4" />
                復習スケジュール
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                次回復習日の一覧とタイムライン · クリックで詳細
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
