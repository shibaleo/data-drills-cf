import { useState } from "react";
import { toast } from "sonner";
import { HabitGrid } from "@/components/habit/habit-grid";
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
} from "@/hooks/queries/use-habit-cells";
import { useTogglHabitCandidates } from "@/hooks/queries/use-toggl-habit-candidates";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HabitsPage() {
  usePageTitle("Habits");

  const habitsQuery = useHabits();
  const habits = habitsQuery.data ?? [];
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();

  const candidatesQuery = useTogglHabitCandidates();
  const candidates = candidatesQuery.data ?? [];

  const cellsQuery = useHabitCells();
  const invalidateCells = useInvalidateHabitCells();
  const today = cellsQuery.data?.today ?? todayISO();
  const cells = cellsQuery.data?.data ?? [];

  const [dialogState, setDialogState] = useState<{ item: HabitRow | null } | null>(null);

  const syncedAtSec = (() => {
    const iso = cellsQuery.data?.synced_at;
    return iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined;
  })();

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="ml-auto">
            <ManualSyncButton
              lastSyncedAt={syncedAtSec}
              onSync={async () => { await invalidateCells(); }}
            />
          </div>
        </div>

        <HabitGrid
          habits={habits}
          cells={cells}
          candidates={candidates}
          today={today}
          onEditHabit={(id) => {
            const item = habits.find((h) => h.id === id) ?? null;
            if (item) setDialogState({ item });
          }}
          onAddHabit={() => setDialogState({ item: null })}
        />
      </div>

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
