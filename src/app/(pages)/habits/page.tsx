import { useMemo, useState } from "react";
import { BacklogChart } from "@/components/backlog-chart";
import { HabitMastersPanel } from "@/components/habit/habit-masters-panel";
import { ManualSyncButton } from "@/components/habit/manual-sync-button";
import {
  MOCK_HABITS,
  buildMockCells,
  toOverlayBlocks,
} from "@/lib/habit-mock";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HabitsPage() {
  const today = todayISO();
  const [habits] = useState(MOCK_HABITS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // mock: schema 接続後は useQuery で warehouse + Worker delta を取得し union する
  const cells = useMemo(() => buildMockCells(habits, today), [habits, today]);
  const habitsById = useMemo(
    () => new Map(habits.map((h) => [h.id, h])),
    [habits],
  );
  const overlayItems = useMemo(
    () => toOverlayBlocks(cells, habitsById),
    [cells, habitsById],
  );

  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(
    Math.floor(Date.now() / 1000) - 720, // 12 min ago の mock
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Habits</h1>
        <ManualSyncButton
          lastSyncedAt={lastSyncedAt}
          onSync={async () => {
            // 後で Worker /api/v1/habit-fresh に差し替え
            await new Promise((r) => setTimeout(r, 400));
            setLastSyncedAt(Math.floor(Date.now() / 1000));
          }}
        />
      </div>

      <BacklogChart
        items={[]}
        overlayItems={overlayItems}
        layers={[]}
        milestones={[]}
        today={today}
        selectedId={selectedId}
        onSelect={setSelectedId}
        showMilestonePins={false}
      />

      <HabitMastersPanel habits={habits} />
    </div>
  );
}
