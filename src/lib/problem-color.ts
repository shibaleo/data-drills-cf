/**
 * Deterministic color generation for problems.
 * Blends a hash-derived color with the subject color.
 */

export function hashToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  const r = (hash >> 16) & 0xff
  const g = (hash >> 8) & 0xff
  const b = hash & 0xff
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** hash(20%) + subject(80%), then +20% white */
export function problemColor(code: string, name: string, subjectColor: string | null): string {
  const hashed = hashToColor(code + name)
  if (!subjectColor) return hashed
  const [hr, hg, hb] = parseHex(hashed)
  const [sr, sg, sb] = parseHex(subjectColor)
  const mr = hr * 0.2 + sr * 0.8
  const mg = hg * 0.2 + sg * 0.8
  const mb = hb * 0.2 + sb * 0.8
  const fr = mr * 0.8 + 255 * 0.2
  const fg = mg * 0.8 + 255 * 0.2
  const fb = mb * 0.8 + 255 * 0.2
  return toHex(fr, fg, fb)
}
