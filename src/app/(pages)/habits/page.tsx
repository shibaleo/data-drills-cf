import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TetrisChart, KindToggles } from "@/components/tetris";
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
import { buildMockCells, toOverlayBlocks } from "@/lib/habit-mock";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HabitsPage() {
  usePageTitle("Habits");

  const today = todayISO();
  const habitsQuery = useHabits();
  const habits = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // dialog state: null = closed; { item: null } = create; { item: row } = edit
  const [dialogState, setDialogState] = useState<{ item: HabitRow | null } | null>(null);

  // throughput / next-step / forecast の独立表示 toggle。
  // 既定: throughput OFF (= 過去実績を隠す)、next-step / forecast ON。
  // /plan の同名 toggle と semantics を揃える。
  const [hideThroughput, setHideThroughput] = useState(true);
  const [hideNextStep, setHideNextStep] = useState(false);
  const [hideForecast, setHideForecast] = useState(false);

  // ⑥ で warehouse JOIN + Worker delta union に置き換え予定
  const cells = useMemo(() => buildMockCells(habits, today), [habits, today]);
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

  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(undefined);

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
                lastSyncedAt={lastSyncedAt}
                onSync={async () => {
                  // ⑤ で Worker /api/v1/habit-fresh に差し替え
                  await new Promise((r) => setTimeout(r, 400));
                  setLastSyncedAt(Math.floor(Date.now() / 1000));
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
          setDialogState(null);
        }}
        onDelete={dialogState?.item ? async () => {
          if (!confirm(`Delete habit "${dialogState.item?.name}"?`)) return;
          await deleteHabit.mutateAsync(dialogState.item!.id);
          toast.success("Habit deleted");
          setDialogState(null);
        } : undefined}
      />
    </div>
  );
}
