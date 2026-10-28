import type { Aging } from '../../data/ledger'

/** Three-colour aging bar: 0–30 / 31–60 / 60+ days. */
export function AgingBar({ aging, className }: { aging: Aging; className?: string }) {
  const parts = [
    { v: aging.current, c: 'bg-chart-1' },
    { v: aging.days31to60, c: 'bg-chart-2' },
    { v: aging.over60, c: 'bg-chart-4' },
  ].filter((p) => p.v > 0)
  return (
    <div className={`flex gap-0.5 ${className ?? ''}`} aria-hidden>
      {parts.map((p, i) => (
        <span key={i} className={`h-2.5 rounded-xs ${p.c}`} style={{ flexGrow: p.v }} />
      ))}
    </div>
  )
}
