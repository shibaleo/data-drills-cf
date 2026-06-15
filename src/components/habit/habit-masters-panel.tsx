import { Check, Circle, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HabitRow } from "@/hooks/queries/use-habits";
import type { HabitCandidate } from "@/hooks/queries/use-toggl-habit-candidates";
import { buildCandidateMap, displayFor } from "@/lib/habit-display";

export type HabitTodayStatus = "done" | "pending" | "n/a";

type Props = {
  habits: HabitRow[];
  candidates: HabitCandidate[];
  /** habitId → 今日の状態。未指定 habit は "n/a" 扱い (= バッジ非表示)。 */
  todayStatus?: Map<string, HabitTodayStatus>;
  onAdd?: () => void;
  onEdit?: (id: string) => void;
};

function TodayBadge({ status }: { status: HabitTodayStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Check className="size-3 text-emerald-500" />
        done
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
        <Circle className="size-3" />
        pending
      </span>
    );
  }
  // n/a (weekly が今日 schedule されない等)
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
      <Minus className="size-3" />
      —
    </span>
  );
}

export function HabitMastersPanel({ habits, candidates, todayStatus, onAdd, onEdit }: Props) {
  const candidateMap = buildCandidateMap(candidates);

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Habits</h2>
        <Button type="button" size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
          <Plus className="size-3.5" />
          Add habit
        </Button>
      </div>
      <ul className="divide-y">
        {habits.map((h) => {
          const d = displayFor(h, candidateMap);
          return (
            <li
              key={h.id}
              className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40 cursor-pointer text-sm"
              onClick={() => onEdit?.(h.id)}
            >
              <span
                className="inline-block size-3 rounded-sm shrink-0"
                style={{ backgroundColor: d.color }}
                aria-hidden
              />
              <span className="font-medium min-w-32">{d.label}</span>
              <Badge variant="outline" className="font-normal">
                {h.cadence}
              </Badge>
              <TodayBadge status={todayStatus?.get(h.id) ?? "n/a"} />
              <span className="text-muted-foreground text-xs ml-auto">
                {h.togglProject}
              </span>
            </li>
          );
        })}
        {habits.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted-foreground text-center">
            No habits yet. Click "Add habit" to start.
          </li>
        )}
      </ul>
    </div>
  );
}
