import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Sparkline } from '../charts/Sparkline'
import { InfoTip } from './InfoTip'

/** Which way the figure moved against the comparison period. */
export type Trend = 'up' | 'down' | 'flat'
/** Whether that move is good or bad for the farm; sets the colour, independent of the arrow. */
export type Sentiment = 'good' | 'bad' | 'neutral'

/** One dashboard figure: value, change against before, and a short trend line. */
export type Kpi = {
  label: string
  value: string
  unit: string
  delta: string
  trend: Trend
  sentiment: Sentiment
  context: string
  /** How the value is calculated (shown from the info icon). */
  info: string
  spark: number[]
}

const sentimentText: Record<Sentiment, string> = {
  good: 'text-fg-success',
  bad: 'text-fg-danger',
  neutral: 'text-fg-secondary',
}

const sentimentIcon: Record<Sentiment, string> = {
  good: 'text-icon-success',
  bad: 'text-icon-danger',
  neutral: 'text-icon-secondary',
}

const sparkColor: Record<Sentiment, string> = {
  good: 'var(--ayk-color-chart-1)',
  bad: 'var(--ayk-color-chart-4)',
  neutral: 'var(--ayk-color-chart-5)',
}

const trendIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }

/** Dashboard card for one KPI, with an info tip explaining how it's worked out. */
export function KpiCard({ kpi }: { kpi: Kpi }) {
  const TrendIcon = trendIcon[kpi.trend]
  return (
    <article className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center">
        <h3 className="flex-1 type-body-md text-fg-secondary">{kpi.label}</h3>
        <InfoTip label={kpi.label} size={16}>
          {kpi.info}
        </InfoTip>
      </div>
      <p className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="type-display-lg text-fg-primary">{kpi.value}</span>
        <span className="type-body-md text-fg-tertiary">{kpi.unit}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <span className="flex shrink-0 items-center gap-0.5">
          <TrendIcon size={16} strokeWidth={1.5} className={sentimentIcon[kpi.sentiment]} />
          <span className={cn('type-label-sm whitespace-nowrap', sentimentText[kpi.sentiment])}>
            {kpi.delta}
          </span>
        </span>
        <span className="min-w-0 flex-1 type-body-sm text-fg-tertiary">{kpi.context}</span>
      </div>
      <Sparkline values={kpi.spark} color={sparkColor[kpi.sentiment]} />
    </article>
  )
}
