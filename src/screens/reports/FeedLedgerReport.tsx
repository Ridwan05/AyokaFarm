'use client'

import { Package } from 'lucide-react'
import { useState } from 'react'
import { DivergingBars } from '../../components/charts/DivergingBars'
import { Card, CardHeader } from '../../components/ui/Card'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { KpiCard } from '../../components/ui/KpiCard'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { ALL_FEED_AVG, FEED_TOLERANCE_PCT, FEED_WATCH_PCT, feedReportKpis, feedTypeLedger, feedVariance, feedVarianceNote, type FeedTypeLedger } from '../../data/reports'
import { LOW_COVER_DAYS } from '../../data/inventory'
import { formatNumber, formatSignedPct } from '../../lib/format'
import { ReportHeader } from './ReportHeader'

const RANGES = ['7 days', '30 days', 'This month', 'Custom'] as const
const dash = <NumberCell tone="muted">—</NumberCell>
const closingOf = (f: FeedTypeLedger) => f.opening + f.received - f.used + f.adjusted
const costOf = (f: FeedTypeLedger) => f.used * f.avgCost

const columns: Column<FeedTypeLedger>[] = [
  { key: 'name', header: 'Feed type', render: (f) => <TextCell tone="primary">{f.name}</TextCell> },
  { key: 'opening', header: 'Opening', align: 'right', width: 96, render: (f) => <NumberCell>{f.opening}</NumberCell> },
  { key: 'received', header: 'Received', align: 'right', width: 96, render: (f) => (f.received ? <NumberCell tone="success">+{f.received}</NumberCell> : dash) },
  { key: 'used', header: 'Used', align: 'right', width: 88, render: (f) => (f.used ? <NumberCell>{f.used}</NumberCell> : dash) },
  { key: 'adjusted', header: 'Adjusted', align: 'right', width: 92, render: (f) => (f.adjusted ? <NumberCell tone="warning">{f.adjusted > 0 ? `+${f.adjusted}` : `−${-f.adjusted}`}</NumberCell> : dash) },
  { key: 'closing', header: 'Closing', align: 'right', width: 88, render: (f) => <NumberCell>{closingOf(f)}</NumberCell> },
  { key: 'cost', header: 'Cost of feed used', align: 'right', width: 140, render: (f) => (f.used ? <NumberCell>₦ {(costOf(f) / 1e6).toFixed(2)}M</NumberCell> : dash) },
  { key: 'daily', header: 'Daily use (7 days)', align: 'right', width: 140, render: (f) => (f.dailyUse ? <NumberCell>{f.dailyUse} bags</NumberCell> : dash) },
  {
    key: 'cover',
    header: 'Cover',
    align: 'right',
    width: 88,
    render: (f) => (f.cover === null ? <TextCell tone="tertiary">not in use</TextCell> : <NumberCell tone={f.cover <= LOW_COVER_DAYS ? 'warning' : 'default'}>{f.cover} days</NumberCell>),
  },
]

export default function FeedLedgerReport() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('30 days')
  const [type, setType] = useState('All feed types')
  const rows = feedTypeLedger.filter((f) => type === 'All feed types' || f.name === type)
  const received = rows.reduce((n, f) => n + f.received, 0)
  const used = rows.reduce((n, f) => n + f.used, 0)
  const cost = rows.reduce((n, f) => n + costOf(f), 0)
  const weighted = feedTypeLedger.filter((f) => f.used > 0 && f.dailyUse !== null)

  return (
    <>
      <ReportHeader title="Feed ledger" description="Stock movements for every feed type, and what the feed used actually cost. Calculated from deliveries, pen entries and counts." />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Range" options={RANGES} value={range} onChange={setRange} />
        <Select label="Feed type" leadingIcon={Package} width={190} options={['All feed types', ...feedTypeLedger.map((f) => f.name)]} value={type} onChange={setType} />
        <span className="flex-1" />
        <span className="type-body-sm text-fg-tertiary">9 Sep – 8 Oct</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {feedReportKpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="min-w-0 flex-1 px-5 pt-4 pb-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Feed used vs expected, by pen</h2>
            <span className="type-body-sm text-fg-tertiary">30 days · green band = ±{FEED_TOLERANCE_PCT}% tolerance</span>
          </div>
          <DivergingBars
            max={FEED_TOLERANCE_PCT}
            band={FEED_TOLERANCE_PCT}
            valueWidth={110}
            rows={feedVariance.map((v) => {
              const watch = Math.abs(v.pct) >= FEED_WATCH_PCT
              return {
                label: `Pen ${v.pen}`,
                value: v.pct,
                color: watch ? 'var(--ayk-color-chart-2)' : 'var(--ayk-color-chart-1)',
                display: <span className={`type-numeric-md ${watch ? 'text-fg-warning' : 'text-fg-primary'}`}>{formatSignedPct(v.pct)}</span>,
              }
            })}
          />
          <p className="pt-2 type-body-sm text-fg-secondary">{feedVarianceNote}</p>
        </Card>
        <Card className="w-full shrink-0 lg:w-[380px] gap-0 px-5 pt-4 pb-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Weighted average cost</h2>
            <span className="type-body-sm text-fg-tertiary">per 25 kg bag</span>
          </div>
          {weighted.map((f) => (
            <KeyValueRow key={f.name} label={f.name} calculated>
              ₦ {formatNumber(f.avgCost)}
            </KeyValueRow>
          ))}
          <KeyValueRow label="All feed" strong calculated>
            ₦ {formatNumber(ALL_FEED_AVG)}
          </KeyValueRow>
          <p className="pt-3 type-body-sm text-fg-secondary">
            Cost of feed used = bags used × the weighted average price of what’s in store (probe G10). This is what Profit & loss counts.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="By feed type" meta={<span className="type-body-sm text-fg-tertiary">Bags · closing = opening + received − used ± counts</span>} />
        <Table columns={columns} rows={rows} rowKey={(f) => f.name} />
        <div className="flex items-center gap-6 rounded-b-xl bg-canvas px-5 py-3 type-label-md">
          <span className="flex-1 text-fg-primary">{type === 'All feed types' ? 'All feed' : type} · 30 days</span>
          <span className="text-fg-secondary">Received {received} bags</span>
          <span className="text-fg-secondary">Used {used} bags</span>
          <span className="text-fg-secondary">Cost of feed used ₦{(cost / 1e6).toFixed(2)}M</span>
        </div>
      </Card>
    </>
  )
}
