/**
 * Status transition matrix — 行: 前回 status、列: 今回 status。
 * セルは件数 + 行内 % (= 「前回 X だった問題が、次にどの status になったか」)。
 *
 * 学習効率の最重要指標:
 *  - 対角線が太い = 同じ status を繰り返している (停滞)
 *  - 右上 (急上昇) が多い = 復習が効いている
 *  - 左下 (Done → Miss など) = decay = stability_days を伸ばしすぎ
 */
import { useMemo } from "react";
import type { AnswerHistoryRow } from "@/hooks/queries/use-answer-history";
import { COLOR_FIRST_ATTEMPT } from "@/lib/block-color";

type Status = { id: string; name: string; color: string | null; sortOrder: number };

type Period = "7d" | "30d" | "all";

type Props = {
  rows: AnswerHistoryRow[];   // answer-history の filtered rows (date 順)
  statuses: Status[];          // answer_status (sortOrder 順)
  period: Period;
  setPeriod: (p: Period) => void;
};

const FIRST_LABEL = "Unrated";

export function StatusTransitionMatrix({ rows, statuses, period, setPeriod }: Props) {
  // 期間フィルタ
  const filteredRows = useMemo(() => {
    if (period === "all") return rows;
    const days = period === "7d" ? 7 : 30;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return rows.filter((r) => r.date >= cutoff);
  }, [rows, period]);

  // 集計: matrix[from][to] = count
  const { matrix, rowTotals } = useMemo(() => {
    const labels = [FIRST_LABEL, ...statuses.map((s) => s.name)];
    const m: Record<string, Record<string, number>> = {};
    for (const from of labels) {
      m[from] = {};
      for (const s of statuses) m[from][s.name] = 0;
    }
    for (const r of filteredRows) {
      const from = r.prevStatusName ?? FIRST_LABEL;
      const to = r.statusName;
      if (!to) continue;
      if (!m[from]) {
        m[from] = {};
        for (const s of statuses) m[from][s.name] = 0;
      }
      m[from][to] = (m[from][to] ?? 0) + 1;
    }
    const totals: Record<string, number> = {};
    for (const from of labels) {
      totals[from] = Object.values(m[from]).reduce((s, n) => s + n, 0);
    }
    return { matrix: m, rowTotals: totals };
  }, [filteredRows, statuses]);

  const rowLabels = [FIRST_LABEL, ...statuses.map((s) => s.name)];
  const colorByName = new Map(statuses.map((s) => [s.name, s.color ?? "#888"]));

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">Status transition (prev → next)</div>
        <div className="inline-flex rounded-md border text-[10px] overflow-hidden">
          {(["7d", "30d", "all"] as const).map((p) => (
            <button key={p} type="button"
              onClick={() => setPeriod(p)}
              className={`px-1.5 py-0.5 transition-colors ${period === p ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {p === "all" ? "All" : p}
            </button>
          ))}
        </div>
      </div>
      <table className="text-xs w-full">
        <thead>
          <tr>
            <th className="text-left text-[10px] font-medium text-muted-foreground pr-2 py-1 w-16">
              prev \ next
            </th>
            {statuses.map((s) => (
              <th key={s.id} className="text-center text-[10px] font-medium px-1 py-1"
                style={{ color: s.color ?? undefined }}>
                {s.name}
              </th>
            ))}
            <th className="text-right text-[10px] font-medium text-muted-foreground pl-2 py-1 w-12">
              total
            </th>
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((from) => {
            const total = rowTotals[from] ?? 0;
            const fromColor = from === FIRST_LABEL ? COLOR_FIRST_ATTEMPT : colorByName.get(from) ?? "#888";
            return (
              <tr key={from} className="border-t">
                <th className="text-left text-[11px] font-semibold pr-2 py-1"
                  style={{ color: fromColor }}>
                  {from}
                </th>
                {statuses.map((to) => {
                  const count = matrix[from]?.[to.name] ?? 0;
                  const pct = total > 0 ? count / total : 0;
                  // heatmap: 行内割合に応じてセル背景の濃さを変える (foreground 色を tint)
                  const bg = pct > 0
                    ? `color-mix(in srgb, hsl(var(--card)) ${100 - Math.round(pct * 60)}%, ${to.color ?? "#888"})`
                    : "transparent";
                  return (
                    <td key={to.id} className="text-center px-1 py-1 tabular-nums"
                      style={{ backgroundColor: bg }}>
                      {count > 0 ? (
                        <span className={pct >= 0.4 ? "font-semibold" : ""}>
                          {count}
                          <span className="text-[9px] text-muted-foreground ml-0.5">
                            ({Math.round(pct * 100)}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-right text-[10px] text-muted-foreground pl-2 py-1 tabular-nums">
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[10px] text-muted-foreground">
        対角が太い = 同 status で停滞 / 右上 = 上達 / 左下 = decay
      </div>
      <Hints matrix={matrix} rowTotals={rowTotals} statuses={statuses} />
    </div>
  );
}

/** matrix からパターンを検出してヒントを出す。
 *  「stability_days を伸ばすべき」など、行動につながる文言だけ。 */
function Hints({
  matrix, rowTotals, statuses,
}: {
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  statuses: Status[];
}) {
  type Hint = { tone: "good" | "warn" | "info"; text: string };
  const hints: Hint[] = [];
  const order = statuses.map((s) => s.name);

  const pct = (from: string, to: string) => {
    const total = rowTotals[from] ?? 0;
    if (total === 0) return 0;
    return (matrix[from]?.[to] ?? 0) / total;
  };
  const isHighStatus = (name: string) => {
    const idx = order.indexOf(name);
    return idx >= Math.floor(order.length * 0.6);  // 上位 40%
  };

  // 1. First → Miss/Rough が殆ど = 新規学習フェーズ
  const firstTotal = rowTotals[FIRST_LABEL] ?? 0;
  if (firstTotal >= 5 && order.length >= 2) {
    const firstLowPct = (pct(FIRST_LABEL, order[0]) + pct(FIRST_LABEL, order[1]));
    if (firstLowPct >= 0.85) {
      hints.push({
        tone: "info",
        text: `${Math.round(firstLowPct * 100)}% of first attempts land in ${order[0]}/${order[1]} — likely tackling unfamiliar problems without first studying the material`,
      });
    }
  }

  // 2. 高位 status → 低位 が多い (decay)
  for (const from of order) {
    if (!isHighStatus(from)) continue;
    const total = rowTotals[from] ?? 0;
    if (total < 3) continue;  // 母数小は除外
    let decay = 0;
    const fromIdx = order.indexOf(from);
    for (let i = 0; i < fromIdx; i++) {
      decay += pct(from, order[i]);
    }
    if (decay >= 0.2) {
      hints.push({
        tone: "warn",
        text: `${from} decays to lower status ${Math.round(decay * 100)}% of the time (n=${total}) — consider shortening stability_days and reobserving`,
      });
    }
  }

  // 3. 対角ループ (= 停滞)
  for (const from of order) {
    const total = rowTotals[from] ?? 0;
    if (total < 5) continue;
    const selfPct = pct(from, from);
    if (selfPct >= 0.45) {
      hints.push({
        tone: "warn",
        text: `${from} → ${from} loop at ${Math.round(selfPct * 100)}% (n=${total}) — stop blind repetition; revisit source, study explanation, or try similar problems`,
      });
    }
  }

  // 4. 上達効率の総括 (positive)
  let upCount = 0;
  let totalNonFirst = 0;
  for (const from of order) {
    const total = rowTotals[from] ?? 0;
    totalNonFirst += total;
    const fromIdx = order.indexOf(from);
    for (let i = fromIdx + 1; i < order.length; i++) {
      upCount += matrix[from]?.[order[i]] ?? 0;
    }
  }
  if (totalNonFirst >= 10) {
    const upRate = upCount / totalNonFirst;
    if (upRate >= 0.7) {
      hints.push({
        tone: "good",
        text: `Up transitions ${Math.round(upRate * 100)}% (${upCount}/${totalNonFirst}) — the review cycle is working well`,
      });
    }
  }

  // 5. 小母数の警告 (高位 status だけ)
  for (const from of order) {
    if (!isHighStatus(from)) continue;
    const total = rowTotals[from] ?? 0;
    if (total > 0 && total < 5) {
      hints.push({
        tone: "info",
        text: `${from} has only ${total} transition samples — extend the observation window to confirm trends`,
      });
    }
  }

  if (hints.length === 0) return null;

  return (
    <div className="border-t pt-2 space-y-1">
      {hints.map((h, i) => (
        <div key={i} className="flex items-start gap-2 text-[10px]">
          <span className={`shrink-0 px-1 py-0 rounded-sm text-[9px] font-semibold uppercase ${
            h.tone === "good" ? "text-green-600 bg-green-500/10"
            : h.tone === "warn" ? "text-destructive bg-destructive/10"
            : "text-muted-foreground bg-muted"
          }`}>
            {h.tone === "good" ? "ok" : h.tone === "warn" ? "warn" : "info"}
          </span>
          <span className="text-muted-foreground">{h.text}</span>
        </div>
      ))}
    </div>
  );
}
