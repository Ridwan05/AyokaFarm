type BarChartProps = {
  values: number[]
  yTicks: number[]
  xLabels: string[]
  /** Bar colour per point (CSS colour). */
  colorFor: (value: number, index: number) => string
  threshold?: { value: number; label: string }
  /** Print the latest value above its bar. */
  labelLast?: { color: string }
  height?: number
}

/** Daily bar chart with an optional dashed threshold line. */
export function BarChart({ values, yTicks, xLabels, colorFor, threshold, labelLast, height = 180 }: BarChartProps) {
  // The axis always reaches the tallest bar, even if the ticks stop short of it.
  const max = Math.max(...yTicks, ...values) || 1
  const y = (v: number) => (1 - v / max) * height
  const last = values.length - 1
  // Labels that would rise above the chart sit just under their line or inside the bar top instead.
  const thresholdTop = threshold ? (y(threshold.value) < 24 ? y(threshold.value) + 4 : y(threshold.value) - 22) : 0

  return (
    <div className="flex w-full">
      <div className="relative w-10 shrink-0" style={{ height }}>
        {yTicks.map((t) => (
          <span key={t} className="absolute left-2 -translate-y-1/2 type-body-sm text-fg-tertiary" style={{ top: y(t) }}>
            {t}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {yTicks.map((t) => (
            <div key={t} className="absolute right-0 left-0 h-px bg-chart-grid" style={{ top: y(t) }} />
          ))}
          {/* Bars shrink to fit narrow screens instead of pushing past the card. */}
          <div className="absolute inset-0 flex items-end justify-between gap-px px-1 sm:px-6">
            {values.map((v, i) => (
              <div key={i} className="relative flex h-full max-w-3 min-w-0 flex-1 justify-center">
                <div
                  className="absolute bottom-0 w-full rounded-t-[3px]"
                  style={
                    v === 0
                      ? { height: 2, background: 'var(--ayk-color-border-default)', borderRadius: 0 }
                      : { height: (v / max) * height, background: colorFor(v, i) }
                  }
                  title={`${v}`}
                />
                {labelLast && i === last && (
                  <span
                    className="absolute right-0 type-label-md whitespace-nowrap"
                    // No room above a bar that reaches the top: the number sits beside it instead.
                    style={(v / max) * height + 20 > height ? { top: 0, right: 'calc(100% + 4px)', color: labelLast.color } : { bottom: (v / max) * height + 2, color: labelLast.color }}
                  >
                    {v}
                  </span>
                )}
              </div>
            ))}
          </div>
          {threshold && (
            <>
              <div
                className="absolute right-0 left-0 border-t-[1.5px] border-dashed border-line-danger"
                style={{ top: y(threshold.value) }}
              />
              <span
                className="absolute left-2 type-label-sm text-fg-danger"
                style={{ top: thresholdTop }}
              >
                {threshold.label}
              </span>
            </>
          )}
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
