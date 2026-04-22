import { ColorBadge } from '@/components/shared/color-badge'

const TAG_BASE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'

/** Status badge. color は DB の answer_status.color を渡す。 */
export function StatusTag({ status, color, className, opaque }: { status: string; color?: string | null; className?: string; opaque?: boolean }) {
  const resolved = color || '#888'
  if (opaque) {
    return (
      <span
        className={`${TAG_BASE} ${className ?? ''}`}
        style={{
          color: resolved,
          backgroundColor: `color-mix(in srgb, hsl(var(--card)) 80%, ${resolved})`,
        }}
      >
        {status}
      </span>
    )
  }
  return <ColorBadge color={resolved} className={className}>{status}</ColorBadge>
}

/** Generic entity badge using ColorBadge (for subjects, levels, tags, topics, etc.) */
export function EntityBadge({ name, color, className }: { name: string; color?: string | null; className?: string }) {
  if (!color) {
    return <span className={`${TAG_BASE} bg-muted text-muted-foreground ${className ?? ''}`}>{name}</span>
  }
  return <ColorBadge color={color} className={className}>{name}</ColorBadge>
}
