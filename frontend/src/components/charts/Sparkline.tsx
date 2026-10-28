type SparklineProps = {
  values: number[]
  color: string
  className?: string
}

/** Trend line for KPI cards. Scales the series to fill the box. */
export function Sparkline({ values, color, className }: SparklineProps) {
  const w = 100
  const h = 36
  const pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      // Flat series sit at the top of the box, matching the design.
      const y = max === min ? pad : pad + (1 - (v - min) / range) * (h / 2 - pad)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className ?? 'h-9 w-full'}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
