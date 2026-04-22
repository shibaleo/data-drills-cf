import { parseDuration } from '@/lib/duration'

interface SparklineEntry {
  date: string
  duration: string | null
  color: string | null
}

interface Props {
  entries: SparklineEntry[]
  highlightDate?: string | null
  onClickDot?: (date: string) => void
}

/** Tiny SVG sparkline — points spaced by date interval, with status-colored dots */
export function DurationSparkline({ entries, highlightDate, onClickDot }: Props) {
  const parsed = entries
    .map((e) => ({ ...e, sec: parseDuration(e.duration) }))
    .filter((e): e is typeof e & { sec: number } => e.sec !== null)
  if (parsed.length < 2) return null

  const min = Math.min(...parsed.map((p) => p.sec))
  const max = Math.max(...parsed.map((p) => p.sec))
  const range = max - min || 1

  // X positions proportional to date intervals
  const firstMs = new Date(parsed[0].date + 'T00:00:00').getTime()
  const lastMs = new Date(parsed[parsed.length - 1].date + 'T00:00:00').getTime()
  const spanMs = lastMs - firstMs || 1

  const w = 120
  const h = 28
  const pad = 6
  const dotR = 2.5

  const pts = parsed.map((p) => {
    const ms = new Date(p.date + 'T00:00:00').getTime()
    const x = pad + ((ms - firstMs) / spanMs) * (w - pad * 2)
    const y = pad + (1 - (p.sec - min) / range) * (h - pad * 2)
    return { x, y, ...p }
  })

  const linePoints = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const trend = parsed[parsed.length - 1].sec - parsed[0].sec
  const lineColor = trend < 0 ? '#4ade80' : trend > 0 ? '#f87171' : '#888'

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={linePoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />
      {pts.map((p, i) => {
        const isHighlight = p.date === highlightDate
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isHighlight ? dotR + 1.5 : dotR}
            fill={p.color ?? '#888'}
            stroke={isHighlight ? p.color ?? '#888' : 'none'}
            strokeWidth={isHighlight ? 1.5 : 0}
            opacity={isHighlight ? 1 : 0.9}
            className={onClickDot ? 'cursor-pointer' : undefined}
            onClick={onClickDot ? () => onClickDot(p.date) : undefined}
          />
        )
      })}
    </svg>
  )
}
