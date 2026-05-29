/**
 * As-of date controls — date picker + play/pause + speed.
 * 各ページの asOf inline panel で共通利用。
 *
 * asOf=null は "now" を意味する。Play 押下時は earliest (= latest-30d 既定) から再生開始。
 */
import { useEffect, useRef, useState } from "react";
import { Pause, Play, X, History } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = {
  asOf: string | null;     // null = "now" mode
  setAsOf: (v: string | null) => void;
  /** 再生範囲の最古 (YYYY-MM-DD)。未指定なら latest-30d。 */
  earliest?: string;
  /** 再生範囲の最新 (YYYY-MM-DD)。通常 today。 */
  latest: string;
  /** "Close" X ボタン。指定すると AsOf 内 X とは別に表示される。 */
  onClose?: () => void;
};

function addDays(d: string, n: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

const SPEEDS = [
  { ms: 400, label: "0.5x" },
  { ms: 200, label: "1x" },
  { ms: 100, label: "2x" },
  { ms: 50, label: "4x" },
];

export function AsOfControls({ asOf, setAsOf, earliest, latest, onClose }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);  // 1x default
  const start = earliest ?? addDays(latest, -30);
  const effectiveAsOf = asOf ?? latest;  // null は today 同義

  const asOfRef = useRef(effectiveAsOf);
  asOfRef.current = effectiveAsOf;

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const cur = asOfRef.current;
      if (cur >= latest) {
        setPlaying(false);
        return;
      }
      setAsOf(addDays(cur, 1));
    };
    const interval = setInterval(tick, SPEEDS[speedIdx].ms);
    return () => clearInterval(interval);
  }, [playing, speedIdx, latest, setAsOf]);

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <History className="size-3.5 text-muted-foreground"/>
      <span className="text-muted-foreground">As of</span>
      <Input type="date" value={asOf ?? ""} min={start} max={latest}
        placeholder="now"
        onChange={(e) => { setPlaying(false); setAsOf(e.target.value || null); }}
        className="h-6 text-[10px] w-32"/>
      <button type="button"
        onClick={() => {
          if (playing) { setPlaying(false); return; }
          // 再生開始: asOf が "now" または latest 以上なら start に巻き戻す
          if (!asOf || asOf >= latest) setAsOf(start);
          setPlaying(true);
        }}
        title={playing ? "Pause" : "Play from start"}
        className="inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent">
        {playing ? <Pause className="size-3.5"/> : <Play className="size-3.5"/>}
      </button>
      <div className="inline-flex rounded-md border text-[10px] overflow-hidden">
        {SPEEDS.map((s, i) => (
          <button key={s.label} type="button"
            onClick={() => setSpeedIdx(i)}
            className={`px-1.5 py-0.5 transition-colors ${speedIdx === i ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {start} → {latest}
      </span>
      {asOf && (
        <button type="button" onClick={() => { setPlaying(false); setAsOf(null); }}
          title="Back to now"
          className="ml-auto inline-flex items-center justify-center px-1.5 py-0.5 rounded-sm text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent">
          Now
        </button>
      )}
      {onClose && (
        <button type="button" onClick={() => { setPlaying(false); onClose(); }}
          title="Close"
          className={`${asOf ? "" : "ml-auto"} inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent`}>
          <X className="size-3.5"/>
        </button>
      )}
    </div>
  );
}
