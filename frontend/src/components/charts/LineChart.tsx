import { niceTicks } from '../../data/metrics'

type Series = {
  label: string
  /** null = no data that day; the line breaks there instead of dropping to zero. */
  values: (number | null)[]
  color: string
  dashed?: boolean
  /** Mark the latest point with a dot. */
  endDot?: boolean
}

type LineChartProps = {
  series: Series[]
  /** Optional shaded band, e.g. a ±10% tolerance around the expected line. */
  band?: { lower: (number | null)[]; upper: (number | null)[]; color: string }
  yTicks: number[]
  formatY: (v: number) => string
  xLabels: string[]
  height?: number
}

const W = 600

/** Runs of consecutive days that have a value, as [index, value] pairs. */
function runs(values: (number | null)[]): [number, number][][] {
  const out: [number, number][][] = []
  let run: [number, number][] = []
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) out.push(run)
      run = []
    } else run.push([i, v])
  })
  if (run.length) out.push(run)
  return out
}

/**
 * Responsive line chart: lines are drawn in a stretched SVG with
 * non-scaling strokes; axis labels are HTML so text never distorts.
 */
export function LineChart({ series, band, yTicks, formatY, xLabels, height = 200 }: LineChartProps) {
  // The scale covers every plotted value, even one the ticks stop short of, so no line leaves the chart.
  const plotted = [...series.flatMap((s) => s.values), ...(band ? [...band.lower, ...band.upper] : [])].filter((v): v is number => v !== null && Number.isFinite(v))
  const lo = Math.min(...yTicks, ...plotted)
  const hi = Math.max(...yTicks, ...plotted)
  const ticks = lo < Math.min(...yTicks) || hi > Math.max(...yTicks) ? niceTicks(lo, hi, yTicks.length) : yTicks
  const yMin = Math.min(...ticks)
  const yMax = Math.max(...ticks)
  const y = (v: number) => (1 - (v - yMin) / (yMax - yMin || 1)) * height
  const n = Math.max(...series.map((s) => s.values.length))
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2)
  const pt = ([i, v]: [number, number]) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`
  const path = (values: (number | null)[]) =>
    runs(values)
      .map((r) => r.map((p, k) => `${k ? 'L' : 'M'}${pt(p)}`).join(''))
      .join('')
  // A day with no neighbours draws no line, so it gets a dot instead.
  const lonely = (values: (number | null)[]) => runs(values).filter((r) => r.length === 1).map((r) => r[0])

  const bandPath = band
    ? runs(band.upper.map((u, i) => (u === null || band.lower[i] === null ? null : u)))
        .filter((r) => r.length > 1)
        .map((r) => r.map((p, k) => `${k ? 'L' : 'M'}${pt(p)}`).join('') + [...r].reverse().map(([i]) => `L${pt([i, band.lower[i]!])}`).join('') + 'Z')
        .join('')
    : undefined

  const dot = (s: Series, [i, v]: [number, number], key: string | number) => (
    <span
      key={key}
      className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ left: `${((x(i) / W) * 100).toFixed(2)}%`, top: Number(y(v).toFixed(2)), backgroundColor: s.color }}
    />
  )

  return (
    <div className="flex w-full gap-0">
      <div className="relative w-[52px] shrink-0" style={{ height }}>
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute left-0 -translate-y-1/2 type-body-sm whitespace-nowrap text-fg-tertiary"
            style={{ top: y(t) }}
          >
            {formatY(t)}
          </span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute right-0 left-0 h-px bg-chart-grid" style={{ top: y(t) }} />
          ))}
          <svg
            viewBox={`0 0 ${W} ${height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            role="img"
            aria-label={series.map((s) => s.label).join(' vs ')}
          >
            {bandPath && <path d={bandPath} fill={band!.color} />}
            {series.map((s) => (
              <path
                key={s.label}
                d={path(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1.5 : 2}
                strokeDasharray={s.dashed ? '4 4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {series.map((s) => {
            // Dots for days with no neighbours, and the end dot if asked for.
            const last = runs(s.values).at(-1)?.at(-1)
            const solo = lonely(s.values).filter((p) => !(s.endDot && p === last))
            return [...solo.map((p) => dot(s, p, `${s.label}-${p[0]}`)), s.endDot && last ? dot(s, last, `${s.label}-end`) : null]
          })}
        </div>
        <div className="mt-2.5 flex justify-between">
          {xLabels.map((l) => (
            <span key={l} className="type-body-sm text-fg-tertiary">
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
