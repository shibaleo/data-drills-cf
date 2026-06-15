import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TetrisChart, KindToggles, type OverlayBlock } from "@/components/tetris";
import { HabitMastersPanel } from "@/components/habit/habit-masters-panel";
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** HabitCell[] → OverlayBlock[]。habit カテゴリ色 + kind 別 opacity を適用。 */
function toOverlayBlocks(
  cells: HabitCell[],
  habitsById: Map<string, HabitRow>,
): OverlayBlock[] {
  const out: OverlayBlock[] = [];
  for (const c of cells) {
    const h = habitsById.get(c.habitId);
    if (!h) continue;
    out.push({
      problemId: `habit:${c.habitId}:${c.date}`,
      code: h.name,
      name: null,
      date: c.date,
      color: h.categoryColor,
      statusName: c.kind,
      // throughput のみ 0.5 で薄く沈める (Plan の overlay 規約と同じ)。
      // next-step / forecast は未指定 → chart 既定の 0.85 が効く。
      opacity: c.kind === "throughput" ? 0.5 : undefined,
      kind: c.kind,
    });
  }
  return out;
}

export default function HabitsPage() {
  usePageTitle("Habits");

  const habitsQuery = useHabits();
  const habits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();

  const cellsQuery = useHabitCells();
  const invalidateCells = useInvalidateHabitCells();
  const today = cellsQuery.data?.today ?? todayISO();
  const cells = useMemo(() => cellsQuery.data?.data ?? [], [cellsQuery.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<{ item: HabitRow | null } | null>(null);

  // throughput / next-step / forecast の独立表示 toggle。
  // 既定: throughput OFF (= 過去実績を隠す)、next-step / forecast ON。
  const [hideThroughput, setHideThroughput] = useState(true);
  const [hideNextStep, setHideNextStep] = useState(false);
  const [hideForecast, setHideForecast] = useState(false);

  const habitsById = useMemo(
    () => new Map(habits.map((h) => [h.id, h])),
    [habits],
  );
  const allOverlay = useMemo(
    () => toOverlayBlocks(cells, habitsById),
    [cells, habitsById],
  );
  const overlayItems = useMemo(
    () => allOverlay.filter((o) => {
      if (hideThroughput && o.kind === "throughput") return false;
      if (hideNextStep && o.kind === "next-step") return false;
      if (hideForecast && o.kind === "forecast") return false;
      return true;
    }),
    [allOverlay, hideThroughput, hideNextStep, hideForecast],
  );

  // sync 時刻: warehouse 由来。manual button で refetch する。
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
          await invalidateCells();  // cells も再取得
          setDialogState(null);
        }}
        onDelete={dialogState?.item ? async () => {
          if (!confirm(`Delete habit "${dialogState.item?.name}"?`)) return;
          await deleteHabit.mutateAsync(dialogState.item!.id);
          toast.success("Habit deleted");
          await invalidateCells();
          setDialogState(null);
        } : undefined}
      />
    </div>
  );
}
