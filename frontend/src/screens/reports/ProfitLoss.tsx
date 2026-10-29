'use client'

import { Egg } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DivergingBars } from '../../components/charts/DivergingBars'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Card, CardHeader } from '../../components/ui/Card'
import { InfoTip } from '../../components/ui/InfoTip'
import { explain } from '../../data/explain'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { KpiCard } from '../../components/ui/KpiCard'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, PrimaryCell, Table, type Column } from '../../components/ui/Table'
import { farmSettings } from '../../data/farmSettings'
import { daysFrom, kpi, naira, nairaKpi, nairaShort, num, penCost, penMoney, period, previous, rowsIn, todayISO, type PenMoney, type PeriodKey } from '../../data/metrics'
import { spreadCharges } from '../../data/rearing'
import { salesOfItem } from '../../data/stockMetrics'
import { useTrade } from '../../data/tradeContext'
import { downloadCsv } from '../../lib/export'
import { ReportHeader } from './ReportHeader'

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

const PERIODS = ['This month', 'Last month', 'Quarter', 'Year to date'] as const
const PERIOD_KEY: Record<(typeof PERIODS)[number], PeriodKey> = { 'This month': 'month', 'Last month': 'last-month', Quarter: 'quarter', 'Year to date': 'ytd' }
const TYPES = ['Layers', 'Broilers'] as const
const VIEWS = ['Cash', 'Spread rearing'] as const

/**
 * cost: cash cost (penCost) in the Cash view; in the Spread view, cash cost − rearing costs moved out
 * of the period + this period's share of rearing cost (incl. any write-off at closing).
 */
type Row = PenMoney & { name: string; flock: string; weeks: string; moved: number; spread: number; writtenOff: number; cost: number; margin: number }

const pct = (a: number, b: number) => (b ? (a / b) * 100 : null)
const signed = (n: number) => `${n < 0 ? '−' : '+'}${nairaShort(Math.abs(n))}`

const cashColumns: Column<Row>[] = [
  { key: 'pen', header: 'Pen', render: (p) => <PrimaryCell initials={`P${p.penId}`} title={p.name} subtitle={[p.flock, p.weeks].filter(Boolean).join(' · ')} /> },
  { key: 'revenue', header: 'Revenue', align: 'right', width: 120, render: (p) => <NumberCell>{nairaShort(p.revenue)}</NumberCell> },
  { key: 'feed', header: 'Feed used', align: 'right', width: 120, render: (p) => <NumberCell>{nairaShort(p.feed)}</NumberCell> },
  { key: 'med', header: 'Medication', align: 'right', width: 110, render: (p) => <NumberCell>{nairaShort(p.medication)}</NumberCell> },
  { key: 'bird', header: 'Bird cost', align: 'right', width: 110, render: (p) => <NumberCell>{nairaShort(p.birds)}</NumberCell> },
  { key: 'overhead', header: 'Overhead', align: 'right', width: 110, render: (p) => <NumberCell>{nairaShort(p.overhead + p.direct)}</NumberCell> },
]

/** Extra columns in the Spread view, before Margin. */
const spreadColumns: Column<Row>[] = [
  { key: 'moved', header: 'Moved to rearing', align: 'right', width: 130, render: (p) => (p.moved ? <NumberCell tone="muted">−{nairaShort(p.moved)}</NumberCell> : <NumberCell tone="muted">—</NumberCell>) },
  { key: 'spread', header: 'Rearing (spread)', align: 'right', width: 130, render: (p) => (p.spread + p.writtenOff ? <NumberCell>{nairaShort(p.spread + p.writtenOff)}</NumberCell> : <NumberCell tone="muted">—</NumberCell>) },
]

const marginColumns: Column<Row>[] = [
  { key: 'margin', header: 'Margin', align: 'right', width: 120, render: (p) => <NumberCell tone={p.margin < 0 ? 'danger' : 'success'}>{p.margin < 0 ? `−${nairaShort(-p.margin)}` : nairaShort(p.margin)}</NumberCell> },
  {
    key: 'pct',
    header: 'Margin %',
    align: 'right',
    width: 92,
    render: (p) => {
      const v = pct(p.margin, p.revenue)
      return v === null ? <NumberCell tone="muted">—</NumberCell> : <NumberCell tone={v < 0 ? 'danger' : 'default'}>{v < 0 ? `−${Math.abs(v).toFixed(1)}` : v.toFixed(1)}%</NumberCell>
    },
  },
]

export default function ProfitLoss() {
  const router = useRouter()
  const { history, catalog } = useTrade()
  const [periodName, setPeriodName] = useState<(typeof PERIODS)[number]>('This month')
  const [type, setType] = useState<(typeof TYPES)[number]>('Layers')
  // The farm's default view is set in Settings → Farm profile; both views stay available here.
  const [view, setView] = useState<(typeof VIEWS)[number]>(farmSettings.spreadRearingCost ? 'Spread rearing' : 'Cash')
  // Rearing cost is a layer idea; broilers are always cash.
  const spreadOn = view === 'Spread rearing' && type === 'Layers'
  const today = todayISO()
  const range = period(PERIOD_KEY[periodName], today)
  const before = previous(range)
  const lays = (penId: number) => catalog.pens.find((p) => p.id === penId)?.bird_types?.lays_eggs ?? false
  const ofType = (m: PenMoney) => (type === 'Layers' ? lays(m.penId) : !lays(m.penId))

  const build = (r: { from: string; to: string }): Row[] => {
    const spread = spreadOn ? spreadCharges(history, catalog, r, today) : new Map<number, never>()
    return penMoney(history, catalog, r)
      .filter(ofType)
      .map((m) => {
        const sp = spread.get(m.penId)
        const moved = sp?.moved ?? 0
        const share = sp?.spread ?? 0
        const writtenOff = sp?.writtenOff ?? 0
        const cost = penCost(m) - moved + share + writtenOff
        const days = rowsIn(history.daily, r, (id) => id === m.penId)
        const flockIds = [...new Set(days.map((d) => d.flockId))]
        const ages = days.map((d) => Math.floor(d.ageDays / 7))
        return {
          ...m,
          name: catalog.pens.find((p) => p.id === m.penId)?.name ?? `Pen ${m.penId}`,
          flock: flockIds.map((id) => history.flocks.find((f) => f.id === id)?.code).filter(Boolean).join(', '),
          weeks: ages.length ? (Math.min(...ages) === Math.max(...ages) ? `week ${Math.min(...ages)}` : `week ${Math.min(...ages)}–${Math.max(...ages)}`) : '',
          moved,
          spread: share,
          writtenOff,
          cost,
          margin: m.revenue - cost,
        }
      })
      .sort((a, b) => b.margin - a.margin)
  }
  const rows = build(range)
  const prevRows = build(before)
  const total = (list: Row[], f: (r: Row) => number) => list.reduce((n, r) => n + f(r), 0)
  const revenue = total(rows, (r) => r.revenue)
  const costs = total(rows, (r) => r.cost)
  const margin = revenue - costs
  const feed = total(rows, (r) => r.feed)
  const prevRevenue = total(prevRows, (r) => r.revenue)
  const prevCosts = total(prevRows, (r) => r.cost)
  const moved = total(rows, (r) => r.moved)
  const spreadTotal = total(rows, (r) => r.spread)
  const writtenOff = total(rows, (r) => r.writtenOff)
  const columns = spreadOn ? [...cashColumns, ...spreadColumns, ...marginColumns] : [...cashColumns, ...marginColumns]
  // Flocks whose rearing cost is being spread, for the banner.
  const spreadFlocks = spreadOn ? [...new Map([...spreadCharges(history, catalog, range, today).values()].flatMap((l) => l.flocks).map((f) => [f.code, f])).values()] : []

  // Broiler flocks still growing: what they've cost since placement.
  const growing = history.flocks
    .filter((f) => f.status === 'active' && !lays(f.pen_id))
    .map((f) => {
      const m = penMoney(history, catalog, { from: f.placed_on, to: today }).find((x) => x.penId === f.pen_id)
      return { pen: f.pen_id, code: f.code, spent: m ? penCost(m) : 0, sold: m?.revenue ?? 0 }
    })
  const growingSpent = growing.reduce((n, g) => n + g.spent, 0)
  const label = type.toLowerCase().replace(/s$/, '')

  const kpis = [
    kpi({ label: `${type.replace(/s$/, '')} revenue`, ...nairaKpi(revenue), current: revenue, previous: prevRevenue, context: 'vs previous period', info: `Approved sales tied to ${label} pens, plus egg-store sales shared between pens by the eggs each collected.`, spark: FLAT }),
    kpi({ label: `${type.replace(/s$/, '')} costs`, ...nairaKpi(costs), current: costs, previous: prevCosts, goodWhen: 'down', context: costs ? `feed is ${num((feed / costs) * 100)}%` : 'no costs yet', info: spreadOn
      ? 'Cash costs (feed × average bag price, doses × batch cost, birds, pen expenses, shared farm costs) − costs moved into flocks still rearing + this period’s share of each layer flock’s rearing cost.'
      : 'Feed used × average bag price + medication doses × batch cost + bird purchases + pen expenses + general expenses shared by bird-days.', spark: FLAT }),
    kpi({ label: `${type.replace(/s$/, '')} margin`, ...nairaKpi(margin), current: pct(margin, revenue), previous: pct(prevRevenue - prevCosts, prevRevenue), points: true, digits: 1, context: revenue ? `${num((margin / revenue) * 100, 1)}% of revenue` : 'no revenue yet', info: `Revenue − costs${spreadOn ? ' (spread view)' : ''}. The change compares the margin as a % of revenue with the previous period.`, spark: FLAT }),
    kpi({ label: 'Broilers in progress', value: String(growing.length), unit: growing.length === 1 ? 'flock' : 'flocks', current: null, previous: null, goodWhen: 'neither', context: growing.length ? `${nairaShort(growingSpent)} spent so far` : 'none growing', info: 'Active broiler flocks. Their costs so far are shown below; profit shows once the birds are sold.', spark: FLAT }),
  ]

  // Unit costs, layers only.
  const eggs = total(rows, (r) => r.eggs)
  const crates = eggs / farmSettings.eggsPerCrate
  const sold = salesOfItem(history, catalog, 'eggs', range)
  const birdsAvg = total(rows, (r) => r.birdDays) / Math.max(1, daysFrom(range.from, range.to) + 1)
  const costPerCrate = crates ? costs / crates : null
  const price = sold.qty ? sold.amount / sold.qty : null

  const worst = rows[rows.length - 1]
  const best = rows[0]
  const note = !rows.length
    ? ''
    : worst && worst.margin < 0
      ? `${worst.name} lost ${nairaShort(-worst.margin)} — feed was ${worst.revenue ? num((worst.feed / worst.revenue) * 100) + '% of its revenue' : nairaShort(worst.feed) + ' with no sales yet'}.`
      : `Every ${label} pen made money; ${best.name} did best at ${num(pct(best.margin, best.revenue) ?? 0, 1)}% margin.`
  const rangeText = `${range.label}${range.label.includes(range.from.slice(0, 4)) ? '' : ` ${range.to.slice(0, 4)}`}`

  const exportRows = () =>
    downloadCsv(
      `profit-and-loss-${label}s-${spreadOn ? 'spread-' : ''}${range.from}-to-${range.to}`,
      ['Pen', 'Flock', 'Weeks', 'Revenue', 'Feed used', 'Medication', 'Bird cost', 'Overhead', ...(spreadOn ? ['Moved to rearing', 'Rearing (spread)', 'Written off at closing'] : []), 'Costs', 'Margin', 'Margin %'],
      rows.map((r) => [
        r.name,
        r.flock,
        r.weeks,
        Math.round(r.revenue),
        Math.round(r.feed),
        Math.round(r.medication),
        Math.round(r.birds),
        Math.round(r.overhead + r.direct),
        ...(spreadOn ? [-Math.round(r.moved), Math.round(r.spread), Math.round(r.writtenOff)] : []),
        Math.round(r.cost),
        Math.round(r.margin),
        pct(r.margin, r.revenue)?.toFixed(1),
      ]),
    )

  return (
    <>
      <ReportHeader
        title="Profit & loss"
        description={`${rangeText}, by pen. Margin counts feed and medication used, not bought, so a big delivery never looks like a loss.`}
        onExport={exportRows}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Period" options={PERIODS} value={periodName} onChange={setPeriodName} />
        <Select label="Bird type" leadingIcon={Egg} width={160} options={TYPES} value={type} onChange={setType} />
        {type === 'Layers' && (
          <span className="flex items-center gap-1.5">
            <SegmentedControl label="View" options={VIEWS} value={view} onChange={setView} />
            <InfoTip label="Cash or spread rearing">
              Cash counts costs in the period they were spent. Spread rearing moves the cost of raising each layer flock out of its rearing months and charges
              it evenly over {farmSettings.layerLayingWeeks} weeks of lay.{' '}
              {farmSettings.spreadRearingCost ? 'The farm opens the P&L in the spread view (Settings → Farm profile).' : 'The farm reports in cash; the spread view is here for comparison (switch the default in Settings → Farm profile).'}
            </InfoTip>
          </span>
        )}
        <span className="flex-1" />
        <span className="type-body-sm text-fg-tertiary">Overhead shared by bird-days · bird cost counted {spreadOn ? 'in the flock’s rearing cost' : 'when the birds were bought'}</span>
      </div>

      {spreadOn && (
        <Alert title={`Spread view${farmSettings.spreadRearingCost ? '' : ' · for comparison'}`}>
          {spreadFlocks.length
            ? `Each layer flock’s rearing cost (${spreadFlocks.map((f) => `${nairaShort(f.total)} for ${f.code}`).join(', ')}) is charged over ${farmSettings.layerLayingWeeks} weeks of lay.`
            : `No layer flock has started laying yet, so there’s no rearing cost to spread; costs while rearing are held as each flock’s rearing cost.`}
          {moved ? ` ${nairaShort(moved)} spent this period on flocks still rearing is held as their rearing cost instead.` : ''}
          {writtenOff ? ` ${nairaShort(writtenOff)} was written off for flocks closed before the end of their laying period.` : ''}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      {!rows.length ? (
        <Card className="items-center p-12">
          <p className="type-body-md text-fg-tertiary">No {label} pen records for {rangeText.toLowerCase()}.</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:flex-row">
            <Card className="min-w-0 flex-1 px-5 pt-4 pb-5">
              <div className="flex items-baseline gap-2 pb-2">
                <h2 className="flex items-center gap-1.5 type-h3 text-fg-primary">
                  Margin by pen
                  <InfoTip label="Margin by pen">{explain.margin()} Egg-store sales are shared between pens by the eggs each collected.</InfoTip>
                </h2>
                <span className="type-body-sm text-fg-tertiary">{rangeText}</span>
              </div>
              <DivergingBars
                rows={rows.map((p) => ({
                  label: p.name.replace(/ ·.*$/, ''),
                  value: p.margin,
                  color: p.margin < 0 ? 'var(--ayk-color-chart-4)' : 'var(--ayk-color-chart-1)',
                  display: <span className={`type-numeric-md ${p.margin < 0 ? 'text-fg-danger' : 'text-fg-success'}`}>{signed(p.margin)}</span>,
                }))}
              />
              <p className="pt-2 type-body-sm text-fg-secondary">{note}</p>
            </Card>
            {type === 'Layers' && (
              <Card className="w-full shrink-0 lg:w-[400px] gap-0 px-5 pt-4 pb-5">
                <div className="flex items-baseline gap-2 pb-2">
                  <h2 className="type-h3 text-fg-primary">Cost per output</h2>
                  <span className="type-body-sm text-fg-tertiary">Layers · {rangeText}{spreadOn ? ' · spread rearing' : ''}</span>
                </div>
                <KeyValueRow label="Cost to produce a crate" calculated={spreadOn ? `${explain.costPerCrate()} Costs include this period’s share of rearing cost.` : explain.costPerCrate()}>
                  {costPerCrate !== null ? naira(costPerCrate) : '—'}
                </KeyValueRow>
                <KeyValueRow label="Average selling price" calculated={explain.avgSellingPrice()}>
                  {price !== null ? naira(price) : '—'}
                </KeyValueRow>
                <KeyValueRow label="Feed per crate" calculated={explain.feedPerCrate()}>
                  {crates ? `${num(total(rows, (r) => r.feedKg) / crates, 1)} kg` : '—'}
                </KeyValueRow>
                <KeyValueRow label="Feed cost per bird" calculated={explain.feedCostPerBird()}>
                  {birdsAvg ? naira(feed / birdsAvg) : '—'}
                </KeyValueRow>
                <KeyValueRow label="Margin per crate" strong calculated="Average selling price − cost to produce a crate.">
                  {costPerCrate !== null && price !== null ? naira(price - costPerCrate) : '—'}
                </KeyValueRow>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader title={`By pen · ${rangeText}`} meta={<span className="type-body-sm text-fg-tertiary">{type}</span>} action={{ label: 'Export', onClick: exportRows }} />
            <Table columns={columns} rows={rows} rowKey={(p) => String(p.penId)} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-b-xl bg-canvas px-5 py-3 type-label-md">
              <span className="flex flex-1 items-center gap-1.5 text-fg-primary">
                All {label} pens
                <InfoTip label="Totals">
                  The pens above added up. Margin % = margin ÷ revenue.{spreadOn ? ' Costs = cash costs − moved to rearing + rearing (spread).' : ''}
                </InfoTip>
              </span>
              <span className="text-fg-secondary">Revenue {nairaShort(revenue)}</span>
              {spreadOn && (
                <>
                  <span className="flex items-center gap-1.5 text-fg-secondary">
                    Moved to rearing −{nairaShort(moved)}
                    <InfoTip label="Moved to rearing">{explain.movedToRearing()}</InfoTip>
                  </span>
                  <span className="flex items-center gap-1.5 text-fg-secondary">
                    Rearing (spread) {nairaShort(spreadTotal + writtenOff)}
                    <InfoTip label="Rearing (spread)">
                      {explain.spreadRearing()}
                      {writtenOff ? ` Includes ${nairaShort(writtenOff)} written off: ${explain.writtenOff()}` : ''}
                    </InfoTip>
                  </span>
                </>
              )}
              <span className="text-fg-secondary">Costs {nairaShort(costs)}</span>
              <span className="text-fg-secondary">
                Margin {margin < 0 ? `−${nairaShort(-margin)}` : nairaShort(margin)}
                {revenue ? ` (${num((margin / revenue) * 100, 1)}%)` : ''}
              </span>
            </div>
          </Card>
        </>
      )}

      {growing.length > 0 && (
        <Alert title="Broiler flocks are judged per flock, not per month" action={<AlertAction onClick={() => router.push('/pens')}>See pens</AlertAction>}>
          {growing.map((g) => `Pen ${g.pen} (${g.code}) has cost ${nairaShort(g.spent)} so far${g.sold ? ` and sold ${nairaShort(g.sold)}` : ''}`).join('; ')}. Their margin is clearest once each flock is sold.
        </Alert>
      )}
    </>
  )
}
