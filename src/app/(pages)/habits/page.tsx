import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TetrisChart, KindToggles, type OverlayBlock } from "@/components/tetris";
import { HabitMastersPanel, type HabitTodayStatus } from "@/components/habit/habit-masters-panel";
import { HabitDialog } from "@/components/habit/habit-dialog";
import { ManualSyncButton } from "@/components/habit/manual-sync-button";
import { usePageTitle } from "@/lib/page-context";
import {
  useHabits,
  useCreateHabit,
  useUpdateHabit,
  useDeleteHabit,
  type HabitRow,
} from "@/hooks/queries/use-habits";
import {
  useHabitCells,
  useInvalidateHabitCells,
  type HabitCell,
} from "@/hooks/queries/use-habit-cells";
import { useTogglHabitCandidates } from "@/hooks/queries/use-toggl-habit-candidates";
import { buildCandidateMap, displayFor } from "@/lib/habit-display";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HabitsPage() {
  usePageTitle("Habits");

  const habitsQuery = useHabits();
  const habits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();

  const candidatesQuery = useTogglHabitCandidates();
  const candidates = useMemo(() => candidatesQuery.data ?? [], [candidatesQuery.data]);
  const candidateMap = useMemo(() => buildCandidateMap(candidates), [candidates]);

  const cellsQuery = useHabitCells();
  const invalidateCells = useInvalidateHabitCells();
  const today = cellsQuery.data?.today ?? todayISO();
  const cells = useMemo(() => cellsQuery.data?.data ?? [], [cellsQuery.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<{ item: HabitRow | null } | null>(null);

  // throughput / next-step / forecast の独立表示 toggle。
  const [hideThroughput, setHideThroughput] = useState(true);
  const [hideNextStep, setHideNextStep] = useState(false);
  const [hideForecast, setHideForecast] = useState(false);

  const habitsById = useMemo(
    () => new Map(habits.map((h) => [h.id, h])),
    [habits],
  );

  // 今日 (`today` 日付) における各 habit の状態:
  //   - throughput cell: done 済
  //   - next-step cell:  未消化 (pending)
  //   - どちらも無い (= cells に出てこない): n/a (weekly が今日 schedule されない等)
  const todayStatus = useMemo<Map<string, HabitTodayStatus>>(() => {
    const m = new Map<string, HabitTodayStatus>();
    for (const c of cells as HabitCell[]) {
      if (c.date !== today) continue;
      if (c.kind === "throughput") m.set(c.habitId, "done");
      else if (c.kind === "next-step") m.set(c.habitId, "pending");
    }
    return m;
  }, [cells, today]);

  // cells → OverlayBlock. 色とラベルは candidateMap 経由で warehouse 由来。
  const allOverlay = useMemo<OverlayBlock[]>(() => {
    const out: OverlayBlock[] = [];
    for (const c of cells as HabitCell[]) {
      const h = habitsById.get(c.habitId);
      if (!h) continue;
      const d = displayFor(h, candidateMap);
      out.push({
        problemId: `habit:${c.habitId}:${c.date}`,
        code: d.label,
        name: null,
        date: c.date,
        color: d.color,
        statusName: c.kind,
        // throughput のみ 0.5 で薄く沈める (Plan の overlay 規約と同じ)。
        opacity: c.kind === "throughput" ? 0.5 : undefined,
        kind: c.kind,
      });
    }
    return out;
  }, [cells, habitsById, candidateMap]);

  const overlayItems = useMemo(
    () => allOverlay.filter((o) => {
      if (hideThroughput && o.kind === "throughput") return false;
      if (hideNextStep && o.kind === "next-step") return false;
      if (hideForecast && o.kind === "forecast") return false;
      return true;
    }),
    [allOverlay, hideThroughput, hideNextStep, hideForecast],
  );

  const syncedAtSec = useMemo(() => {
    const iso = cellsQuery.data?.synced_at;
    return iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined;
  }, [cellsQuery.data]);

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      <TetrisChart
        toolbar={
          <>
            <KindToggles
              hideThroughput={hideThroughput}
              hideNextStep={hideNextStep}
              hideForecast={hideForecast}
              setHideThroughput={setHideThroughput}
              setHideNextStep={setHideNextStep}
              setHideForecast={setHideForecast}
              labels={{
                throughput: "throughput (past done)",
                nextStep: "next step (today's pending)",
                forecast: "forecast (future slots)",
              }}
            />
            <div className="ml-auto">
              <ManualSyncButton
                lastSyncedAt={syncedAtSec}
                onSync={async () => {
                  await invalidateCells();
                }}
              />
            </div>
          </>
        }
        items={[]}
        overlayItems={overlayItems}
        layers={[]}
        milestones={[]}
        today={today}
        selectedId={selectedId}
        onSelect={setSelectedId}
        showMilestonePins={false}
      />

      <HabitMastersPanel
        habits={habits}
        candidates={candidates}
        todayStatus={todayStatus}
        onAdd={() => setDialogState({ item: null })}
        onEdit={(id) => {
          const item = habits.find((h) => h.id === id) ?? null;
          if (item) setDialogState({ item });
        }}
      />

      <HabitDialog
        open={dialogState !== null}
        onOpenChange={(o) => { if (!o) setDialogState(null); }}
        item={dialogState?.item ?? null}
        onSave={async (payload) => {
          if (dialogState?.item) {
            await updateHabit.mutateAsync({ id: dialogState.item.id, payload });
            toast.success("Habit updated");
          } else {
            await createHabit.mutateAsync(payload);
            toast.success("Habit created");
          }
          await invalidateCells();
          setDialogState(null);
        }}
        onDelete={dialogState?.item ? async () => {
          if (!confirm(`Delete habit "${dialogState.item?.togglDescription}"?`)) return;
          await deleteHabit.mutateAsync(dialogState.item!.id);
          toast.success("Habit deleted");
          await invalidateCells();
          setDialogState(null);
        } : undefined}
      />
    </div>
  );
}
