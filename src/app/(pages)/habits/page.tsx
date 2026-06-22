import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HabitGrid } from "@/components/habit/habit-grid";
import { HabitDialog } from "@/components/habit/habit-dialog";
import { ManualSyncButton } from "@/components/habit/manual-sync-button";
import { usePageTitle } from "@/lib/page-context";
import {
  useHabits,
  useCreateHabit,
  useUpdateHabit,
  useDeleteHabit,
  useReorderHabits,
  type HabitRow,
} from "@/hooks/queries/use-habits";
import {
  useHabitCells,
  useInvalidateHabitCells,
} from "@/hooks/queries/use-habit-cells";

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
  const reorderHabits = useReorderHabits();

  const cellsQuery = useHabitCells();
  const invalidateCells = useInvalidateHabitCells();
  const today = cellsQuery.data?.today ?? todayISO();
  const cells = cellsQuery.data?.data ?? [];
  const colors = cellsQuery.data?.colors ?? {};

  const [dialogState, setDialogState] = useState<{ item: HabitRow | null } | null>(null);

  const syncedAtSec = (() => {
    const iso = cellsQuery.data?.synced_at;
    return iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined;
  })();

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      <div className="rounded-md border p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDialogState({ item: null })}
            className="gap-1.5 h-7"
          >
            <Plus className="size-3.5" />
            Add habit
          </Button>
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
          colors={colors}
          today={today}
          onEditHabit={(id) => {
            const item = habits.find((h) => h.id === id) ?? null;
            if (item) setDialogState({ item });
          }}
          onReorder={(ids) => reorderHabits.mutate(ids)}
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
