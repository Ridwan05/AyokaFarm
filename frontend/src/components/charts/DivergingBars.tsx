import type { ReactNode } from 'react'

type Row = { label: string; value: number; display: ReactNode; color: string }

type DivergingBarsProps = {
  rows: Row[]
  /** Optional shaded band around zero, e.g. ±10% tolerance. */
  band?: number
  /** Symmetric domain; defaults to the largest absolute value (or the band). */
  max?: number
  /** Width of the value column in px. */
  valueWidth?: number
}

/** Horizontal bars growing left (negative) or right (positive) from a zero line. */
export function DivergingBars({ rows, band, max, valueWidth = 120 }: DivergingBarsProps) {
  const lo = Math.min(0, ...rows.map((r) => r.value), band ? -band : 0)
  const hi = Math.max(0, ...rows.map((r) => r.value), band ?? 0)
  const span = max ? 2 * max : hi - lo || 1
  const min = max ? -max : lo
  const pos = (v: number) => ((v - min) / span) * 100

  return (
    <ul className="flex flex-col">
      {rows.map((r) => {
        const zero = pos(0)
        const end = pos(r.value)
        return (
          <li key={r.label} className="flex h-10 items-center gap-4">
            <span className="w-[100px] shrink-0 type-label-md text-fg-primary">{r.label}</span>
            <span className="relative h-5 flex-1">
              {band !== undefined && (
                <span className="absolute inset-y-0 bg-brand-subtle" style={{ left: `${pos(-band)}%`, right: `${100 - pos(band)}%` }} />
              )}
              <span
                className="absolute top-1/2 h-3 -translate-y-1/2 rounded-xs"
                style={{ left: `${Math.min(zero, end)}%`, width: `${Math.abs(end - zero)}%`, background: r.color }}
              />
              <span className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${zero}%` }} />
            </span>
            <span className="shrink-0 text-right" style={{ width: valueWidth }}>
              {r.display}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
