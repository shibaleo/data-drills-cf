import { ListTodo, Telescope, Waypoints } from "lucide-react";

/**
 * Throughput / Next-step / Forecast の 3 カテゴリ独立 toggle row。
 * 明るい = 表示中、暗い = 非表示中。
 *
 * /plan と /habits で同一ロジックなので共通化。caller は OverlayBlock を
 * filter する際に hideX フラグを参照する。
 */
type Props = {
  hideThroughput: boolean;
  hideNextStep: boolean;
  hideForecast: boolean;
  setHideThroughput: (v: boolean | ((prev: boolean) => boolean)) => void;
  setHideNextStep: (v: boolean | ((prev: boolean) => boolean)) => void;
  setHideForecast: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** label 文言を caller ドメインに合わせて差し替え可能 (default は plan 文言)。 */
  labels?: {
    throughput?: string;
    nextStep?: string;
    forecast?: string;
  };
};

const DEFAULT_LABELS = {
  throughput: "throughput (past actuals)",
  nextStep: "next step (1 immediate entry per problem)",
  forecast: "forecast (cascade after next step)",
};

export function KindToggles({
  hideThroughput,
  hideNextStep,
  hideForecast,
  setHideThroughput,
  setHideNextStep,
  setHideForecast,
  labels,
}: Props) {
  const lbl = { ...DEFAULT_LABELS, ...labels };
  const buttons = [
    { hidden: hideThroughput, setH: setHideThroughput, Icon: Waypoints, label: lbl.throughput },
    { hidden: hideNextStep,   setH: setHideNextStep,   Icon: ListTodo,  label: lbl.nextStep },
    { hidden: hideForecast,   setH: setHideForecast,   Icon: Telescope, label: lbl.forecast },
  ];
  return (
    <>
      {buttons.map(({ hidden, setH, Icon, label }) => (
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
    </>
  );
}
