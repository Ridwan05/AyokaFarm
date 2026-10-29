'use client'

import { Bird, Download, Warehouse } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart } from '../components/charts/LineChart'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardLink } from '../components/ui/Card'
import { InfoTip } from '../components/ui/InfoTip'
import { KpiCard } from '../components/ui/KpiCard'
import { RowMenu } from '../components/ui/Menu'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { NumberCell, PrimaryCell, Table, type Column } from '../components/ui/Table'
import { FEED_COVER_FULL_DAYS, pensToday, type Alert, type PenToday } from '../data/dashboard'
import { deriveAlerts } from '../data/derivedAlerts'
import { explain } from '../data/explain'
import { farmSettings } from '../data/farmSettings'
import { alertRow, dateLabels, penKind, penName } from '../data/farmViews'
import { feedTypes } from '../data/inventory'
import {
  addDays,
  ageBills,
  daysFrom,
  feedVariance,
  inRange,
  kpi,
  lastDays,
  layingRate,
  liveBirdsByPen,
  mortalityPct,
  nairaKpi,
  nairaShort,
  niceTicks,
  period,
  relativeDay,
  rowsIn,
  rowsOn,
  sum,
  timeOf,
  todayISO,
  type PeriodKey,
  type Range,
} from '../data/metrics'
import { farm } from '../data/session'
import { useCurrentUser } from '../data/sessionContext'
import { useTrade, type Trade } from '../data/tradeContext'
import { AlertRow } from '../features/alerts/AlertRow'
import { cn } from '../lib/cn'
import { downloadCsv } from '../lib/export'
import { formatLongDate, formatNaira, formatNumber, formatSignedPct, greeting } from '../lib/format'

const RANGES = ['Today', '7 days', '30 days'] as const
type RangeLabel = (typeof RANGES)[number]
const RANGE_KEY: Record<RangeLabel, PeriodKey> = { Today: 'today', '7 days': '7d', '30 days': '30d' }
const BIRD_FILTERS = ['Layers & broilers', 'Layers', 'Broilers'] as const
const ALL_PENS = 'All pens'

/** The same number of days just before r. */
const before = (r: Range): Range => {
  const len = daysFrom(r.from, r.to)
  return { from: addDays(r.from, -(len + 1)), to: addDays(r.from, -1), label: 'previous period' }
}

export default function Dashboard() {
  const currentUser = useCurrentUser()
  const trade = useTrade()
  const { history, catalog } = trade
  const [range, setRange] = useState<RangeLabel>('Today')
  const [pen, setPen] = useState<string>(ALL_PENS)
  const [birds, setBirds] = useState<(typeof BIRD_FILTERS)[number]>('Layers & broilers')
  const penOptions = [ALL_PENS, ...catalog.pens.map((p) => p.name)]
  const penOk = (id: number) => (pen === ALL_PENS || penName(catalog, id) === pen) && (birds === 'Layers & broilers' || penKind(catalog, id) === birds)

  const today = todayISO()
  const rows = pensToday.filter((p) => penOk(p.id))
  const recorded = rows.filter((p) => p.died !== null).length
  const alerts = useMemo(() => deriveAlerts(trade, today), [trade, today]).filter((a) => a.pen === undefined || penOk(a.pen))
  const todays = rowsOn(history.daily, today, penOk)
  const updated = todays.map((d) => d.createdAt).sort().at(-1)
  // Read the clock once, not on every render.
  const [hello] = useState(() => greeting(new Date()))
  const firstName = currentUser.name.split(' ')[0]

  function exportPens() {
    downloadCsv(
      'pens-today',
      ['Pen', 'Flock', 'Birds', 'Died today', 'Feed vs expected %', 'Laying rate %', 'Entry'],
      rows.map((p) => [p.name, p.flock, p.birds, p.died, p.feedVsExpected?.toFixed(1), p.layingRate?.toFixed(1), p.entry.label]),
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(farm.today)}
        title={`${hello}, ${firstName}`}
        description={
          alerts.length
            ? `${alerts.length} ${alerts.length === 1 ? 'thing needs' : 'things need'} your attention across ${rows.length} pens.`
            : `Nothing needs your attention across ${rows.length} pens.`
        }
        actions={
          <Button leadingIcon={Download} onClick={exportPens}>
            Export
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Date range" options={RANGES} value={range} onChange={setRange} />
        <Select label="Pen" leadingIcon={Warehouse} options={penOptions} value={pen} onChange={setPen} />
        <Select label="Bird type" leadingIcon={Bird} options={BIRD_FILTERS} value={birds} onChange={setBirds} />
        <span className="flex-1" />
        <p className="flex items-center gap-1.5 type-body-sm whitespace-nowrap text-fg-tertiary">
          {updated ? `Updated ${timeOf(updated)}` : 'No entries yet today'} · {recorded} of {rows.length} pens recorded
          <InfoTip label="Pens recorded">{explain.entriesRecorded()} “Updated” is the time the latest entry was saved.</InfoTip>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {dashboardKpis(trade, period(RANGE_KEY[range], today), penOk, pen !== ALL_PENS || birds !== 'Layers & broilers').map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <NeedsAttention alerts={alerts.slice(0, 5).map(alertRow)} total={alerts.length} />
        <FeedStock />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <FeedChart trade={trade} penOk={penOk} scope={pen !== ALL_PENS ? pen : birds === 'Layers & broilers' ? 'All pens' : `${birds} pens`} />
        <Receivables trade={trade} />
      </div>

      <PensToday rows={rows} recorded={recorded} />
    </>
  )
}

function dashboardKpis(trade: Trade, r: Range, penOk: (id: number) => boolean, filtered: boolean) {
  const { history } = trade
  const prev = before(r)
  const sparkDates = lastDays(Math.min(30, Math.max(8, daysFrom(r.from, r.to) + 1)), r.to)
  const isToday = r.from === r.to
  const cur = rowsIn(history.daily, r, penOk)
  const old = rowsIn(history.daily, prev, penOk)

  // Birds alive at the end of a day: each active flock's latest count on or before it.
  const flocks = history.flocks.filter((f) => f.status === 'active' && penOk(f.pen_id))
  const birdsOn = (date: string) =>
    sum(flocks, (f) => {
      if (f.placed_on > date) return 0
      const latest = history.daily.filter((d) => d.flockId === f.id && d.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]
      return latest ? latest.closing : f.birds_placed
    })
  const live = sum([...liveBirdsByPen(history, penOk).values()], (n) => n)

  const lay = layingRate(cur)
  const layerPens = new Set(cur.filter((d) => d.eggs !== null).map((d) => d.penId)).size
  const mort = mortalityPct(cur)
  const deaths = sum(cur, (d) => d.mortality)

  const sales = (x: { from: string; to: string }) =>
    sum(
      history.sales.filter((s) => s.approval === 'approved' && inRange(s.sold_on, x)),
      (s) => Number(s.total ?? s.quantity * s.unit_price),
    )
  const salesNow = sales(r)
  const salesAmount = nairaKpi(salesNow)
  const vs = isToday ? 'vs yesterday' : 'vs previous period'

  return [
    kpi({
      label: 'Live birds',
      value: formatNumber(live),
      unit: 'birds',
      current: live,
      previous: birdsOn(prev.to) || null,
      goodWhen: 'neither',
      context: `${flocks.length} pens`,
      info: 'Each active flock’s closing count from its latest daily entry (birds placed less deaths), added up across the pens shown.',
      spark: sparkDates.map(birdsOn),
    }),
    kpi({
      label: 'Laying rate',
      value: lay === null ? '—' : lay.toFixed(1),
      unit: '%',
      current: lay,
      previous: layingRate(old),
      points: true,
      digits: 1,
      context: lay === null ? 'No layer entries' : `${layerPens} layer pens · ${vs}`,
      info: 'Eggs collected ÷ hens at the start of the day, layer pens only. Change is compared with the previous period.',
      spark: sparkDates.map((d) => layingRate(rowsOn(history.daily, d, penOk)) ?? 0),
    }),
    kpi({
      label: isToday ? 'Mortality today' : 'Mortality',
      value: mort === null ? '—' : mort.toFixed(2),
      unit: '%',
      current: mort,
      previous: mortalityPct(old),
      points: true,
      goodWhen: 'down',
      context: `${formatNumber(deaths)} birds · ${vs}`,
      info: 'Birds that died ÷ birds at the start of the day, across the pens shown. Change is compared with the previous period.',
      spark: sparkDates.map((d) => mortalityPct(rowsOn(history.daily, d, penOk)) ?? 0),
    }),
    kpi({
      label: isToday ? 'Sales today' : `Sales · ${r.label.toLowerCase()}`,
      value: salesAmount.value,
      unit: salesAmount.unit,
      current: salesNow,
      previous: sales(prev),
      context: filtered ? `All pens · ${vs}` : vs,
      info: 'Quantity × price of approved sales in the period (sales waiting for approval are left out), compared with the period before.',
      spark: sparkDates.map((d) => sales({ from: d, to: d })),
    }),
  ]
}

function NeedsAttention({ alerts, total }: { alerts: Alert[]; total: number }) {
  return (
    <Card className="min-w-0 flex-1">
      <CardHeader
        title="Needs attention"
        info="Checked from the records each time the page opens: mortality and feed use against the thresholds in Settings, low or expiring stock, missing entries and overdue debts."
        meta={<Badge tone={total ? 'danger' : 'success'}>{total} open</Badge>}
        action={{ label: 'View all alerts', to: '/alerts' }}
      />
      {alerts.length ? (
        <ul>
          {alerts.map((alert, i) => (
            <li key={alert.id}>
              <AlertRow {...alert} last={i === alerts.length - 1} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-5 type-body-md text-fg-tertiary">Nothing needs attention right now.</p>
      )}
    </Card>
  )
}

function FeedStock() {
  return (
    <Card className="w-full shrink-0 lg:w-[400px]">
      <CardHeader title="Feed stock" info={`${explain.daysOfCover()} The bar is full at ${FEED_COVER_FULL_DAYS} days.`} action={{ label: 'Inventory', to: '/inventory' }} />
      <div className="flex flex-col gap-5 px-5 pb-5">
        {feedTypes.map((feed) => {
          const days = feed.daysOfCover
          const low = days !== null && days <= farmSettings.lowStockDays
          const pct = days === null ? 0 : Math.min(days / FEED_COVER_FULL_DAYS, 1) * 100
          return (
            <div key={feed.name} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 type-label-md text-fg-primary">{feed.name}</span>
                <span className="type-body-sm text-fg-tertiary">{formatNumber(feed.bags)} bags</span>
                <span className={cn('type-numeric-md', days === null ? 'text-fg-tertiary' : low ? 'text-fg-warning' : 'text-fg-primary')}>
                  {days === null ? 'not in use' : `${days} days`}
                </span>
              </div>
              <div
                className="h-1.5 rounded-full bg-subtle"
                role="meter"
                aria-label={`${feed.name} days of cover`}
                aria-valuenow={days ?? 0}
                aria-valuemin={0}
                aria-valuemax={FEED_COVER_FULL_DAYS}
              >
                {pct > 0 && <div className={cn('h-1.5 rounded-full', low ? 'bg-accent' : 'bg-chart-1')} style={{ width: `${pct}%` }} />}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function FeedChart({ trade, penOk, scope }: { trade: Trade; penOk: (id: number) => boolean; scope: string }) {
  const { history, catalog } = trade
  // Last 30 days, trimmed to the days with entries (a new farm, or today before anyone has recorded).
  const all = lastDays(30)
  const has = all.map((d) => rowsOn(history.daily, d, penOk).length > 0)
  const start = Math.max(0, has.indexOf(true))
  const end = has.lastIndexOf(true)
  const dates = end - start >= 1 ? all.slice(start, end + 1) : all
  const daily = dates.map((d) => rowsOn(history.daily, d, penOk))
  const actual = daily.map((rows) => sum(rows, (r) => r.feedKg))
  const expected = daily.map((rows) => sum(rows, (r) => r.expectedKg ?? 0))
  const tol = farmSettings.feedVariancePct / 100
  const lower = expected.map((e) => e * (1 - tol))
  const upper = expected.map((e) => e * (1 + tol))
  const hasData = actual.some((v) => v > 0)

  // The latest day with entries, and the pen furthest from its expected feed that day.
  const lastIdx = daily.findLastIndex((rows) => rows.length > 0)
  const lastRows = lastIdx >= 0 ? daily[lastIdx] : []
  const lastVar = feedVariance(lastRows)
  const worst = [...lastRows].filter((r) => r.variancePct !== null).sort((a, b) => Math.abs(b.variancePct!) - Math.abs(a.variancePct!))[0]
  const overall = feedVariance(daily.flat())
  const within = overall !== null && Math.abs(overall) <= farmSettings.feedVariancePct

  return (
    <Card className="min-w-0 flex-1 gap-4 px-5 pt-4 pb-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-[180px] flex-1 flex-col">
          <h2 className="flex items-center gap-1.5 type-h3 text-fg-primary">
            Feed used vs expected
            <InfoTip label="Feed used vs expected">
              Actual = bags used in daily entries × kg a bag. Expected = birds × grams a bird a day for their age (Settings → Feed & targets); the band is ±{farmSettings.feedVariancePct}%.
            </InfoTip>
          </h2>
          <p className="type-body-sm text-fg-tertiary">{scope} · kg per day · {dates.length === 30 ? 'last 30 days' : `last ${dates.length} days with entries`}</p>
        </div>
        <Legend swatch={<span className="h-0.5 w-4 bg-chart-1" />} label="Actual" />
        <Legend swatch={<span className="h-0.5 w-4 bg-chart-5" />} label="Expected" />
        <Legend swatch={<span className="size-3 rounded-xs bg-brand-subtle" />} label={`±${farmSettings.feedVariancePct}% tolerance`} />
      </div>
      {hasData ? (
        <>
          <LineChart
            series={[
              { label: 'Expected', values: expected, color: 'var(--ayk-color-chart-5)', dashed: true },
              { label: 'Actual', values: actual, color: 'var(--ayk-color-chart-1)', endDot: true },
            ]}
            band={{ lower, upper, color: 'var(--ayk-color-bg-brand-subtle)' }}
            yTicks={niceTicks(Math.min(...lower.filter((v) => v > 0), ...actual.filter((v) => v > 0)), Math.max(...upper, ...actual))}
            formatY={(v) => `${formatNumber(v)} kg`}
            xLabels={dateLabels(dates)}
          />
          <p className="flex flex-wrap items-center gap-x-2 type-body-sm">
            {lastVar !== null && (
              <span className={cn('type-label-sm', Math.abs(lastVar) > farmSettings.feedVariancePct ? 'text-fg-warning' : 'text-fg-secondary')}>
                {formatSignedPct(lastVar)} {relativeDay(dates[lastIdx]).toLowerCase()}
              </span>
            )}
            <span className="text-fg-secondary">
              {overall === null ? 'No feed targets set for these pens' : within ? 'Within tolerance overall' : `${formatSignedPct(overall)} overall — outside tolerance`}
              {worst && Math.abs(worst.variancePct!) > farmSettings.feedVariancePct && ` · largest gap ${penName(catalog, worst.penId)} (${formatSignedPct(worst.variancePct!)})`}
            </span>
            <InfoTip label="Variance">(Feed used − expected) ÷ expected, for the latest day with entries and for all the days shown. Pens without a feed band are left out.</InfoTip>
          </p>
        </>
      ) : (
        <p className="type-body-md text-fg-tertiary">No feed recorded in the last 30 days.</p>
      )}
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

const BUCKET_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-4']

function Receivables({ trade }: { trade: Trade }) {
  const today = todayISO()
  const owing = trade.customers.map((c) => trade.customerOpenBills(c.id)).filter((b) => b.length)
  const buckets = ageBills(owing.flat(), today)
  const total = sum(buckets, (b) => b.amount)

  const supplierOwed = trade.suppliers.map((s) => ({ s, owed: trade.supplierBalance(s.id) })).filter((x) => x.owed > 0)
  const supplierTotal = sum(supplierOwed, (x) => x.owed)
  const overdue = sum(
    supplierOwed.flatMap(({ s }) => trade.supplierOpenBills(s.id).filter((b) => daysFrom(b.date, today) > s.termsDays)),
    (b) => b.left,
  )

  return (
    <Card className="w-full shrink-0 lg:w-[400px] gap-4 px-5 pt-4 pb-5">
      <div className="flex items-center">
        <h2 className="flex flex-1 items-center gap-1.5 type-h3 text-fg-primary">
          Owed to the farm
          <InfoTip label="Owed to the farm">{explain.customerBalance()} Added up over every customer who owes.</InfoTip>
        </h2>
        <CardLink to="/customers">Debtors</CardLink>
      </div>
      <p className="flex items-baseline gap-2">
        <span className="type-display-lg text-fg-primary">{nairaShort(total)}</span>
        <span className="type-body-md text-fg-tertiary">
          {owing.length} {owing.length === 1 ? 'customer' : 'customers'}
        </span>
      </p>
      {total > 0 && (
        <div className="flex gap-0.5" aria-hidden>
          {buckets.map((b, i) => (b.amount > 0 ? <span key={b.label} className={cn('h-2.5 rounded-xs', b.overdue ? BUCKET_COLORS[2] : BUCKET_COLORS[i])} style={{ flexGrow: b.amount }} /> : null))}
        </div>
      )}
      <p className="-mb-2 flex items-center gap-1.5 type-overline text-fg-tertiary">
        By age
        <InfoTip label="By age" size={12}>
          {explain.ageing()}
        </InfoTip>
      </p>
      <ul className="flex flex-col gap-2">
        {buckets.map((b, i) => (
          <li key={b.label} className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', b.overdue ? BUCKET_COLORS[2] : BUCKET_COLORS[i])} />
            <span className="flex-1 type-body-md text-fg-secondary">{b.label}</span>
            <span className={cn('type-numeric-md', b.overdue && b.amount > 0 ? 'text-fg-danger' : 'text-fg-primary')}>{formatNaira(b.amount)}</span>
          </li>
        ))}
      </ul>
      <hr className="border-line-subtle" />
      <div className="flex items-center gap-2">
        <div className="flex flex-1 flex-col">
          <span className="flex items-center gap-1.5 type-label-md text-fg-primary">
            Owed to suppliers
            <InfoTip label="Owed to suppliers">
              {explain.supplierBalance()} Past terms = {explain.pastTerms().charAt(0).toLowerCase() + explain.pastTerms().slice(1)}
            </InfoTip>
          </span>
          <span className="type-body-sm text-fg-tertiary">
            {supplierOwed.length} {supplierOwed.length === 1 ? 'supplier' : 'suppliers'} · {overdue > 0 ? `${formatNaira(overdue)} past terms` : 'nothing overdue'}
          </span>
        </div>
        <span className="type-numeric-md text-fg-primary">{formatNaira(supplierTotal)}</span>
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
        <NumberCell tone={(p.died * 100) / (p.birds + p.died || 1) > farmSettings.mortalityAlertPct ? 'danger' : 'default'}>{p.died}</NumberCell>
      ),
  },
  {
    key: 'feed',
    header: 'Feed vs expected',
    align: 'right',
    width: 160,
    render: (p) =>
      p.feedVsExpected === null ? dash : (
        <NumberCell tone={Math.abs(p.feedVsExpected) >= farmSettings.feedVariancePct ? 'warning' : 'default'}>{formatSignedPct(p.feedVsExpected)}</NumberCell>
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
        info={`${explain.entriesRecorded()} Feed vs expected and laying come from each pen’s entry.`}
        meta={
          <span className="type-body-sm text-fg-tertiary">
            {recorded} of {rows.length} recorded
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
