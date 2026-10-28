type Series = {
  label: string
  values: number[]
  color: string
  dashed?: boolean
  /** Mark the latest point with a dot. */
  endDot?: boolean
}

type LineChartProps = {
  series: Series[]
  /** Optional shaded band, e.g. a ±10% tolerance around the expected line. */
  band?: { lower: number[]; upper: number[]; color: string }
  yTicks: number[]
  formatY: (v: number) => string
  xLabels: string[]
  height?: number
}

const W = 600

/**
 * Responsive line chart: lines are drawn in a stretched SVG with
 * non-scaling strokes; axis labels are HTML so text never distorts.
 */
export function LineChart({ series, band, yTicks, formatY, xLabels, height = 200 }: LineChartProps) {
  const yMin = Math.min(...yTicks)
  const yMax = Math.max(...yTicks)
  const y = (v: number) => (1 - (v - yMin) / (yMax - yMin)) * height
  const x = (i: number, n: number) => (i / (n - 1)) * W
  const path = (values: number[]) =>
    values.map((v, i) => `${i ? 'L' : 'M'}${x(i, values.length).toFixed(2)},${y(v).toFixed(2)}`).join('')

  const bandPath = band
    ? path(band.upper) +
      band.lower
        .map((v, i) => [i, v] as const)
        .reverse()
        .map(([i, v]) => `L${x(i, band.lower.length).toFixed(2)},${y(v).toFixed(2)}`)
        .join('') +
      'Z'
    : undefined

  return (
    <div className="flex w-full gap-0">
      <div className="relative w-[52px] shrink-0" style={{ height }}>
        {yTicks.map((t) => (
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
          {yTicks.map((t) => (
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
          {series
            .filter((s) => s.endDot)
            .map((s) => (
              <span
                key={s.label}
                className="absolute right-0 size-2 translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ top: y(s.values[s.values.length - 1]), background: s.color }}
              />
            ))}
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
