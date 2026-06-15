import { useMemo, useState } from "react";
import { TetrisChart, KindToggles } from "@/components/tetris";
import { HabitMastersPanel } from "@/components/habit/habit-masters-panel";
import { ManualSyncButton } from "@/components/habit/manual-sync-button";
import { usePageTitle } from "@/lib/page-context";
import {
  MOCK_HABITS,
  buildMockCells,
  toOverlayBlocks,
} from "@/lib/habit-mock";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HabitsPage() {
  usePageTitle("Habits");

  const today = todayISO();
  const [habits] = useState(MOCK_HABITS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // throughput / next-step / forecast の独立表示 toggle。
  // 既定: throughput OFF (= 過去実績を隠す)、next-step / forecast ON。
  // /plan の同名 toggle と semantics を揃える。
  const [hideThroughput, setHideThroughput] = useState(true);
  const [hideNextStep, setHideNextStep] = useState(false);
  const [hideForecast, setHideForecast] = useState(false);

  // mock: schema 接続後は useQuery で warehouse + Worker delta を取得し union する
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

  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(
    Math.floor(Date.now() / 1000) - 720, // 12 min ago の mock
  );

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

      <HabitMastersPanel habits={habits} />
    </div>
  );
}
