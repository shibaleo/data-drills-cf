import type { ForgettingInfo } from '@/lib/forgetting-curve'

/** Retention bar: red(0%) → yellow(50%) → green(100%) */
export function RetentionBar({ info }: { info: ForgettingInfo }) {
  return <RetentionBarInner retention={info.retention} elapsedDays={info.elapsedDays} />
}

/** Raw variant for flashcards (no ForgettingInfo dependency) */
export function RetentionBarRaw({ retention, elapsedDays }: { retention: number; elapsedDays: number }) {
  return <RetentionBarInner retention={retention} elapsedDays={elapsedDays} />
}

function RetentionBarInner({ retention, elapsedDays }: { retention: number; elapsedDays: number }) {
  const pct = Math.round(retention * 100)
  const hue = retention * 120 // 0=red, 60=yellow, 120=green
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: `hsl(${hue}, 80%, 50%)` }}
        />
      </div>
      <span className="text-xs font-medium text-foreground/60 whitespace-nowrap">
        {pct}% · {elapsedDays < 1 ? '今日' : `${Math.round(elapsedDays)}日前`}
      </span>
    </div>
  )
}
