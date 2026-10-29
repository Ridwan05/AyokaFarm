'use client'

import { Bird, Download, Warehouse } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart } from '../components/charts/LineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardLink } from '../components/ui/Card'
import { KpiCard } from '../components/ui/KpiCard'
import { RowMenu } from '../components/ui/Menu'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { NumberCell, PrimaryCell, Table, type Column } from '../components/ui/Table'
import { alerts, feedSeries, feedStock, FEED_COVER_FULL_DAYS, kpis, MORTALITY_SPIKE_BIRDS, pensToday, receivables, type Alert, type PenToday } from '../data/dashboard'
import { farm } from '../data/session'
import { useCurrentUser } from '../data/sessionContext'
import { AlertRow } from '../features/alerts/AlertRow'
import { entryAlerts, withTodaysRecord } from '../data/production'
import { useTrade } from '../data/tradeContext'
import { cn } from '../lib/cn'
import { formatLongDate, formatNaira, formatNumber, formatSignedPct, greeting } from '../lib/format'
import { farmSettings } from '../data/farmSettings'

const RANGES = ['Today', '7 days', '30 days', 'Custom'] as const
const PEN_FILTERS = ['All pens', 'Pen 1', 'Pen 2', 'Pen 3', 'Pen 4', 'Pen 5', 'Pen 6'] as const
const BIRD_FILTERS = ['Layers & broilers', 'Layers', 'Broilers'] as const

export default function Dashboard() {
  const currentUser = useCurrentUser()
  const [range, setRange] = useState<(typeof RANGES)[number]>('Today')
  const [pen, setPen] = useState<(typeof PEN_FILTERS)[number]>('All pens')
  const [birds, setBirds] = useState<(typeof BIRD_FILTERS)[number]>('Layers & broilers')
  const { productionRecords } = useTrade()
  const today = pensToday.map((p) => withTodaysRecord(p, productionRecords))
  const liveAlerts = [...entryAlerts(productionRecords), ...alerts]
  const recorded = today.filter((p) => p.died !== null).length
  const firstName = currentUser.name.split(' ')[0]

  return (
    <>
      <PageHeader sample
        eyebrow={formatLongDate(farm.today)}
        title={`${greeting(farm.today)}, ${firstName}`}
        description={`${liveAlerts.length} things need your attention across ${pensToday.length} pens.`}
        actions={<Button leadingIcon={Download}>Export</Button>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Date range" options={RANGES} value={range} onChange={setRange} />
        <Select label="Pen" leadingIcon={Warehouse} options={PEN_FILTERS} value={pen} onChange={setPen} />
        <Select label="Bird type" leadingIcon={Bird} options={BIRD_FILTERS} value={birds} onChange={setBirds} />
        <span className="flex-1" />
        <p className="type-body-sm whitespace-nowrap text-fg-tertiary">
          Updated 08:14 · {recorded} of {pensToday.length} pens recorded
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <NeedsAttention alerts={liveAlerts} />
        <FeedStock />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <FeedChart />
        <Receivables />
      </div>

      <PensToday rows={today} recorded={recorded} />
    </>
  )
}

function NeedsAttention({ alerts }: { alerts: Alert[] }) {
  return (
    <Card className="min-w-0 flex-1">
      <CardHeader
        title="Needs attention"
        meta={<Badge tone="danger">{alerts.length} open</Badge>}
        action={{ label: 'View all alerts', to: '/alerts' }}
      />
      <ul>
        {alerts.map((alert, i) => (
          <li key={alert.id}>
            <AlertRow {...alert} last={i === alerts.length - 1} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function FeedStock() {
  return (
    <Card className="w-full shrink-0 lg:w-[400px]">
      <CardHeader title="Feed stock" action={{ label: 'Inventory', to: '/inventory' }} />
      <div className="flex flex-col gap-5 px-5 pb-5">
        {feedStock.map((feed) => {
          const low = feed.days !== null && feed.days <= farmSettings.lowStockDays
          const pct = feed.days === null ? 0 : Math.min(feed.days / FEED_COVER_FULL_DAYS, 1) * 100
          return (
            <div key={feed.name} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 type-label-md text-fg-primary">{feed.name}</span>
                <span className="type-body-sm text-fg-tertiary">{feed.bags} bags</span>
                <span
                  className={cn(
                    'type-numeric-md',
                    feed.days === null ? 'text-fg-tertiary' : low ? 'text-fg-warning' : 'text-fg-primary',
                  )}
                >
                  {feed.days === null ? 'not in use' : `${feed.days} days`}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full bg-subtle"
                role="meter"
                aria-label={`${feed.name} days of cover`}
                aria-valuenow={feed.days ?? 0}
                aria-valuemin={0}
                aria-valuemax={FEED_COVER_FULL_DAYS}
              >
                {pct > 0 && (
                  <div
                    className={cn('h-1.5 rounded-full', low ? 'bg-accent' : 'bg-chart-1')}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}
        <p className="type-body-sm text-fg-tertiary">
          Days of cover = bags in store ÷ average daily use (last 7 days)
        </p>
      </div>
    </Card>
  )
}

function FeedChart() {
  return (
    <Card className="min-w-0 flex-1 gap-4 px-5 pt-4 pb-5">
      <div className="flex items-center gap-4">
        <div className="flex flex-1 flex-col">
          <h2 className="type-h3 text-fg-primary">Feed used vs expected</h2>
          <p className="type-body-sm text-fg-tertiary">All pens · kg per day · last 30 days</p>
        </div>
        <Legend swatch={<span className="h-0.5 w-4 bg-chart-1" />} label="Actual" />
        <Legend swatch={<span className="h-0.5 w-4 bg-chart-5" />} label="Expected" />
        <Legend swatch={<span className="size-3 rounded-xs bg-brand-subtle" />} label="±10% tolerance" />
      </div>
      <LineChart
        series={[
          { label: 'Expected', values: feedSeries.expected, color: 'var(--ayk-color-chart-5)', dashed: true },
          { label: 'Actual', values: feedSeries.actual, color: 'var(--ayk-color-chart-1)', endDot: true },
        ]}
        band={{ lower: feedSeries.lower, upper: feedSeries.upper, color: 'var(--ayk-color-bg-brand-subtle)' }}
        yTicks={feedSeries.yTicks}
        formatY={(v) => `${formatNumber(v)} kg`}
        xLabels={feedSeries.xLabels}
      />
      <p className="flex gap-2 type-body-sm">
        <span className="type-label-sm text-fg-warning">{feedSeries.todayDelta}</span>
        <span className="text-fg-secondary">{feedSeries.summary}</span>
      </p>
    </Card>
  )
}

function Legend({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      <span className="type-body-sm text-fg-secondary">{label}</span>
    </span>
  )
}

function Receivables() {
  return (
    <Card className="w-full shrink-0 lg:w-[400px] gap-4 px-5 pt-4 pb-5">
      <div className="flex items-center">
        <h2 className="flex-1 type-h3 text-fg-primary">Owed to the farm</h2>
        <CardLink to="/customers">Debtors</CardLink>
      </div>
      <p className="flex items-baseline gap-2">
        <span className="type-display-lg text-fg-primary">{receivables.total}</span>
        <span className="type-body-md text-fg-tertiary">{receivables.customers} customers</span>
      </p>
      <div className="flex gap-0.5" aria-hidden>
        {receivables.buckets.map((b) => (
          <span key={b.label} className={cn('h-2.5 rounded-xs', b.color)} style={{ flexGrow: b.amount }} />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {receivables.buckets.map((b) => (
          <li key={b.label} className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', b.color)} />
            <span className="flex-1 type-body-md text-fg-secondary">{b.label}</span>
            <span className={cn('type-numeric-md', b.overdue ? 'text-fg-danger' : 'text-fg-primary')}>
              {formatNaira(b.amount)}
            </span>
          </li>
        ))}
      </ul>
      <hr className="border-line-subtle" />
      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-col">
          <span className="type-label-md text-fg-primary">Owed to suppliers</span>
          <span className="type-body-sm text-fg-tertiary">
            {receivables.suppliers.count} suppliers · {receivables.suppliers.note}
          </span>
        </div>
        <span className="type-numeric-md text-fg-primary">{formatNaira(receivables.suppliers.total)}</span>
      </div>
    </Card>
  )
}

const dash = <NumberCell tone="muted">—</NumberCell>

const penColumns: Column<PenToday>[] = [
  {
    key: 'pen',
    header: 'Pen',
    render: (p) => <PrimaryCell initials={p.initials} title={p.name} subtitle={p.flock} />,
  },
  { key: 'birds', header: 'Birds', align: 'right', width: 110, render: (p) => <NumberCell>{formatNumber(p.birds)}</NumberCell> },
  {
    key: 'died',
    header: 'Died today',
    align: 'right',
    width: 120,
    render: (p) =>
      p.died === null ? dash : (
        <NumberCell tone={p.died >= MORTALITY_SPIKE_BIRDS ? 'danger' : 'default'}>{p.died}</NumberCell>
      ),
  },
  {
    key: 'feed',
    header: 'Feed vs expected',
    align: 'right',
    width: 160,
    render: (p) =>
      p.feedVsExpected === null ? dash : (
        <NumberCell tone={Math.abs(p.feedVsExpected) >= farmSettings.feedVariancePct ? 'warning' : 'default'}>
          {formatSignedPct(p.feedVsExpected)}
        </NumberCell>
      ),
  },
  {
    key: 'laying',
    header: 'Laying rate',
    align: 'right',
    width: 130,
    render: (p) => (p.layingRate === null ? dash : <NumberCell>{p.layingRate.toFixed(1)}%</NumberCell>),
  },
  {
    key: 'entry',
    header: 'Entry',
    width: 190,
    render: (p) => (
      <Badge tone={p.entry.tone} dot>
        {p.entry.label}
      </Badge>
    ),
  },
]

function PensToday({ rows, recorded }: { rows: PenToday[]; recorded: number }) {
  const router = useRouter()
  return (
    <Card>
      <CardHeader
        title="Pens today"
        meta={
          <span className="type-body-sm text-fg-tertiary">
            {recorded} of {pensToday.length} recorded
          </span>
        }
        action={{ label: 'All pens', to: '/pens' }}
      />
      <Table
        columns={penColumns}
        rows={rows}
        rowKey={(p) => String(p.id)}
        onRowClick={(p) => router.push(`/pens/${p.id}`)}
        rowActions={(p) => (
          <RowMenu
            items={[
              { label: 'Open pen', onSelect: () => router.push(`/pens/${p.id}`) },
              { label: 'Open production', onSelect: () => router.push('/production') },
            ]}
          />
        )}
      />
    </Card>
  )
}
