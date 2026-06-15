import { useMemo, useState } from "react";
import { ListTodo, Telescope, Waypoints } from "lucide-react";
import { BacklogChart } from "@/components/backlog-chart";
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
      <div className="rounded-md border p-3 space-y-2">
        <div className="flex items-center gap-2">
          {/* Throughput / Next-step / Forecast 独立 toggle。/plan と同 semantics。
              明るい = 表示中、暗い = 非表示中。 */}
          {[
            { hidden: hideThroughput, setH: setHideThroughput, Icon: Waypoints, label: "throughput (past done)" },
            { hidden: hideNextStep,   setH: setHideNextStep,   Icon: ListTodo,  label: "next step (today's pending)" },
            { hidden: hideForecast,   setH: setHideForecast,   Icon: Telescope, label: "forecast (future slots)" },
          ].map(({ hidden, setH, Icon, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setH((v) => !v)}
              title={hidden ? `Show ${label}` : `Hide ${label}`}
              aria-pressed={!hidden}
              className={`inline-flex items-center justify-center size-6 rounded-md border transition-colors shrink-0 ${
                hidden
                  ? "text-muted-foreground/40 hover:text-muted-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="size-3" />
            </button>
          ))}
          <div className="ml-auto">
            <ManualSyncButton
              lastSyncedAt={lastSyncedAt}
              onSync={async () => {
                // 後で Worker /api/v1/habit-fresh に差し替え
                await new Promise((r) => setTimeout(r, 400));
                setLastSyncedAt(Math.floor(Date.now() / 1000));
              }}
            />
          </div>
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
      </div>

      <HabitMastersPanel habits={habits} />
    </div>
  );
}
