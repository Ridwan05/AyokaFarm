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
import { feedTypes } from '../../data/inventory'
import { dayMonth, feedVariance, kpi, naira, nairaShort, period, previous, rowsIn, todayISO, unitCost, type Range } from '../../data/metrics'
import { dailyLedger } from '../../data/stockMetrics'
import { useTrade } from '../../data/tradeContext'
import { downloadCsv } from '../../lib/export'
import { formatNumber, formatSignedPct } from '../../lib/format'
import { ReportHeader } from './ReportHeader'
import { farmSettings } from '../../data/farmSettings'

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

const RANGES = ['7 days', '30 days', 'This month', '90 days'] as const
const dash = <NumberCell tone="muted">—</NumberCell>

type FeedRow = { id: number; name: string; opening: number; received: number; used: number; adjusted: number; closing: number; avgCost: number; dailyUse: number | null; cover: number | null }
const costOf = (f: FeedRow) => f.used * f.avgCost

const columns: Column<FeedRow>[] = [
  { key: 'name', header: 'Feed type', render: (f) => <TextCell tone="primary">{f.name}</TextCell> },
  { key: 'opening', header: 'Opening', align: 'right', width: 96, render: (f) => <NumberCell>{formatNumber(f.opening)}</NumberCell> },
  { key: 'received', header: 'Received', align: 'right', width: 96, render: (f) => (f.received ? <NumberCell tone="success">+{formatNumber(f.received)}</NumberCell> : dash) },
  { key: 'used', header: 'Used', align: 'right', width: 88, render: (f) => (f.used ? <NumberCell>{formatNumber(f.used)}</NumberCell> : dash) },
  { key: 'adjusted', header: 'Adjusted', align: 'right', width: 92, render: (f) => (f.adjusted ? <NumberCell tone="warning">{f.adjusted > 0 ? `+${f.adjusted}` : `−${-f.adjusted}`}</NumberCell> : dash) },
  { key: 'closing', header: 'Closing', align: 'right', width: 88, render: (f) => <NumberCell>{formatNumber(f.closing)}</NumberCell> },
  { key: 'cost', header: 'Cost of feed used', align: 'right', width: 140, render: (f) => (f.used && f.avgCost ? <NumberCell>{nairaShort(costOf(f))}</NumberCell> : dash) },
  { key: 'daily', header: 'Daily use (7 days)', align: 'right', width: 140, render: (f) => (f.dailyUse ? <NumberCell>{f.dailyUse} bags</NumberCell> : dash) },
  {
    key: 'cover',
    header: 'Cover',
    align: 'right',
    width: 88,
    render: (f) => (f.cover === null ? <TextCell tone="tertiary">not in use</TextCell> : <NumberCell tone={f.cover <= farmSettings.lowStockDays ? 'warning' : 'default'}>{f.cover} days</NumberCell>),
  },
]

export default function FeedLedgerReport() {
  const { history, catalog } = useTrade()
  const [rangeName, setRangeName] = useState<(typeof RANGES)[number]>('30 days')
  const [type, setType] = useState('All feed types')
  const today = todayISO()
  const range: Range = rangeName === 'This month' ? period('month', today) : period(rangeName === '7 days' ? '7d' : rangeName === '30 days' ? '30d' : '90d', today)

  const ledgerOf = (id: number, r: { from: string; to: string }) => {
    const days = dailyLedger(history, (d) => d.item === 'feed' && d.feedTypeId === id, r.from, r.to)
    return {
      opening: days[days.length - 1]?.opening ?? 0,
      received: days.reduce((n, d) => n + d.received, 0),
      used: days.reduce((n, d) => n + d.used, 0),
      adjusted: days.reduce((n, d) => n + d.adjusted, 0),
      closing: days[0]?.closing ?? 0,
    }
  }
  const all: FeedRow[] = catalog.feedTypes
    .filter((f) => f.is_active || ledgerOf(f.id, range).used > 0)
    .map((f) => {
      const live = feedTypes.find((x) => x.name === f.name)
      return { id: f.id, name: f.name, ...ledgerOf(f.id, range), avgCost: unitCost(history, { feedTypeId: f.id }), dailyUse: live?.bagsPerDay ?? null, cover: live?.daysOfCover ?? null }
    })
  const rows = all.filter((f) => type === 'All feed types' || f.name === type)
  const received = rows.reduce((n, f) => n + f.received, 0)
  const used = rows.reduce((n, f) => n + f.used, 0)
  const cost = rows.reduce((n, f) => n + costOf(f), 0)
  const priced = all.filter((f) => f.avgCost > 0)
  const allAvg = (() => {
    const bags = priced.reduce((n, f) => n + f.used, 0)
    return bags ? priced.reduce((n, f) => n + costOf(f), 0) / bags : priced.length ? priced.reduce((n, f) => n + f.avgCost, 0) / priced.length : 0
  })()
  const bagKg = new Set(catalog.feedTypes.map((f) => Number(f.bag_kg)))

  const feedId = type === 'All feed types' ? null : all.find((f) => f.name === type)?.id
  const feedOk = (d: { feedTypeId: number | null }) => feedId == null || d.feedTypeId === feedId
  const entries = rowsIn(history.daily, range).filter(feedOk)
  const before = previous(range)
  const prevUsed = rowsIn(history.daily, before).filter(feedOk).reduce((n, d) => n + d.feedBags, 0)
  const variance = catalog.pens
    .map((p) => ({ pen: p.id, pct: feedVariance(entries.filter((d) => d.penId === p.id)) }))
    .filter((v): v is { pen: number; pct: number } => v.pct !== null)
    .map((v) => ({ ...v, pct: Number(v.pct.toFixed(1)) }))
  const farmVar = feedVariance(entries)
  const tol = farmSettings.feedVariancePct
  const watchPct = tol / 2
  const outlier = [...variance].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0]
  const note = !outlier
    ? 'No entries with an expected amount in this range.'
    : Math.abs(outlier.pct) < watchPct
      ? `Every pen is within ±${watchPct}% of its expected feed.`
      : `Pen ${outlier.pen} is furthest from its band (${formatSignedPct(outlier.pct)}).${Math.abs(outlier.pct) > tol ? ' That is outside the tolerance — check the feeders and the entries.' : ''}`
  const lowest = all.filter((f) => f.cover !== null).sort((a, b) => a.cover! - b.cover!)[0]

  const kpis = [
    kpi({ label: 'Feed used', value: formatNumber(used), unit: 'bags', current: used, previous: prevUsed, goodWhen: 'neither', context: `${nairaShort(cost)} · ${range.label.toLowerCase()}`, info: 'Bags of feed used from pen entries', spark: FLAT }),
    kpi({ label: 'Average cost', value: allAvg ? formatNumber(Math.round(allAvg)) : '—', unit: '₦ a bag', current: null, previous: null, goodWhen: 'neither', context: 'weighted average', info: 'Weighted average price paid for feed', spark: FLAT }),
    kpi({ label: 'Farm variance', value: farmVar === null ? '—' : `${farmVar > 0 ? '+' : ''}${farmVar.toFixed(1)}`, unit: '%', current: null, previous: null, goodWhen: 'neither', context: farmVar === null ? 'no targets' : Math.abs(farmVar) <= tol ? `within ±${tol}%` : `outside ±${tol}%`, info: 'Feed used vs expected, all pens', spark: FLAT }),
    kpi({ label: 'Lowest cover', value: lowest ? String(lowest.cover) : '—', unit: 'days', current: null, previous: null, goodWhen: 'neither', context: lowest ? `${lowest.name}${lowest.cover! <= farmSettings.lowStockDays ? ' · reorder suggested' : ''}` : 'no feed in use', info: 'Feed type with the fewest days of cover', spark: FLAT }),
  ]

  const exportRows = () =>
    downloadCsv(
      `feed-ledger-${range.from}-to-${range.to}`,
      ['Feed type', 'Opening (bags)', 'Received', 'Used', 'Adjusted', 'Closing', 'Average cost (₦/bag)', 'Cost of feed used (₦)', 'Daily use (7 days)', 'Cover (days)'],
      rows.map((f) => [f.name, f.opening, f.received, f.used, f.adjusted, f.closing, Math.round(f.avgCost), Math.round(costOf(f)), f.dailyUse, f.cover]),
    )

  return (
    <>
      <ReportHeader title="Feed ledger" description="Stock movements for every feed type, and what the feed used actually cost. Calculated from deliveries, pen entries and counts." onExport={exportRows} />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Range" options={RANGES} value={rangeName} onChange={setRangeName} />
        <Select label="Feed type" leadingIcon={Package} width={190} options={['All feed types', ...all.map((f) => f.name)]} value={type} onChange={setType} />
        <span className="flex-1" />
        <span className="type-body-sm text-fg-tertiary">
          {dayMonth(range.from)} – {dayMonth(range.to)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="min-w-0 flex-1 px-5 pt-4 pb-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Feed used vs expected, by pen</h2>
            <span className="type-body-sm text-fg-tertiary">
              {range.label} · green band = ±{tol}% tolerance
            </span>
          </div>
          <DivergingBars
            max={Math.max(tol, ...variance.map((v) => Math.abs(v.pct)))}
            band={tol}
            valueWidth={110}
            rows={variance.map((v) => {
              const watch = Math.abs(v.pct) >= watchPct
              return {
                label: `Pen ${v.pen}`,
                value: v.pct,
                color: watch ? 'var(--ayk-color-chart-2)' : 'var(--ayk-color-chart-1)',
                display: <span className={`type-numeric-md ${watch ? 'text-fg-warning' : 'text-fg-primary'}`}>{formatSignedPct(v.pct)}</span>,
              }
            })}
          />
          <p className="pt-2 type-body-sm text-fg-secondary">{note}</p>
        </Card>
        <Card className="w-full shrink-0 lg:w-[380px] gap-0 px-5 pt-4 pb-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Weighted average cost</h2>
            <span className="type-body-sm text-fg-tertiary">per {bagKg.size === 1 ? `${[...bagKg][0]} kg ` : ''}bag</span>
          </div>
          {priced.map((f) => (
            <KeyValueRow key={f.name} label={f.name} calculated>
              {naira(f.avgCost)}
            </KeyValueRow>
          ))}
          {!priced.length && <p className="type-body-sm text-fg-tertiary">No feed purchases recorded yet.</p>}
          <KeyValueRow label="All feed" strong calculated>
            {allAvg ? naira(allAvg) : '—'}
          </KeyValueRow>
          <p className="pt-3 type-body-sm text-fg-secondary">
            Cost of feed used = bags used × the weighted average price paid for that feed. Opening stock has no price, so it is costed at the same average. This is what
            Profit &amp; loss counts.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="By feed type" meta={<span className="type-body-sm text-fg-tertiary">Bags · closing = opening + received − used ± counts</span>} action={{ label: 'Export', onClick: exportRows }} />
        <Table columns={columns} rows={rows} rowKey={(f) => f.name} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-b-xl bg-canvas px-5 py-3 type-label-md">
          <span className="flex-1 text-fg-primary">
            {type === 'All feed types' ? 'All feed' : type} · {range.label.toLowerCase()}
          </span>
          <span className="text-fg-secondary">Received {formatNumber(received)} bags</span>
          <span className="text-fg-secondary">Used {formatNumber(used)} bags</span>
          <span className="text-fg-secondary">Cost of feed used {nairaShort(cost)}</span>
        </div>
      </Card>
    </>
  )
}

