'use client'

import { Warehouse } from 'lucide-react'
import { useState } from 'react'
import { LineChart } from '../../components/charts/LineChart'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, PrimaryCell, Table, type Column } from '../../components/ui/Table'
import { farmSettings } from '../../data/farmSettings'
import { addDays, datesBetween, dayMonth, feedVariance, kpi, layingRate, mortalityPct, num, period, previous, rowsIn, rowsOn, series, todayISO, type Range } from '../../data/metrics'
import { axisLabels, isLate, ticksFor } from '../../data/reportMetrics'
import { useTrade } from '../../data/tradeContext'
import { downloadCsv } from '../../lib/export'
import { formatNumber, formatSignedPct } from '../../lib/format'
import { ReportHeader } from './ReportHeader'

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

const RANGES = ['7 days', '30 days', 'This month', '90 days'] as const
const PEN_FILTERS = ['All pens', 'Layers', 'Broilers'] as const
const dash = <NumberCell tone="muted">—</NumberCell>

type PenRow = {
  pen: number
  name: string
  layers: boolean
  flock: string
  weeks: string
  recorded: number
  days: number
  crates: number | null
  laying: number | null
  ageDays: number | null
  died: number
  mortalityPct: number
  feedBags: number
  vsExpected: number | null
  late: number
  flag: boolean
}

const columns: Column<PenRow>[] = [
  { key: 'pen', header: 'Pen', render: (p) => <PrimaryCell initials={`P${p.pen}`} title={p.name} subtitle={[p.flock, p.weeks].filter(Boolean).join(' · ')} /> },
  { key: 'recorded', header: 'Recorded', align: 'right', width: 110, render: (p) => <NumberCell tone={p.recorded < p.days ? 'danger' : 'default'}>{p.recorded} / {p.days}</NumberCell> },
  { key: 'eggs', header: 'Eggs', align: 'right', width: 85, render: (p) => (p.crates === null ? dash : <NumberCell>{formatNumber(Math.round(p.crates))} cr</NumberCell>) },
  {
    key: 'laying',
    header: 'Laying · age',
    align: 'right',
    width: 120,
    render: (p) => (p.layers ? (p.laying === null ? dash : <NumberCell>{p.laying.toFixed(1)}%</NumberCell>) : p.ageDays === null ? dash : <NumberCell>{`${Math.floor(p.ageDays / 7)} wk ${p.ageDays % 7} d`}</NumberCell>),
  },
  { key: 'died', header: 'Died', align: 'right', width: 72, render: (p) => <NumberCell tone={p.flag ? 'warning' : 'default'}>{formatNumber(p.died)}</NumberCell> },
  { key: 'mortality', header: 'Mortality', align: 'right', width: 92, render: (p) => <NumberCell tone={p.flag ? 'warning' : 'default'}>{p.mortalityPct.toFixed(1)}%</NumberCell> },
  { key: 'feed', header: 'Feed', align: 'right', width: 96, render: (p) => <NumberCell>{formatNumber(p.feedBags)} bags</NumberCell> },
  {
    key: 'vs',
    header: 'vs expected',
    align: 'right',
    width: 104,
    render: (p) => (p.vsExpected === null ? dash : <NumberCell tone={Math.abs(p.vsExpected) > farmSettings.feedVariancePct ? 'warning' : 'default'}>{formatSignedPct(Number(p.vsExpected.toFixed(1)))}</NumberCell>),
  },
  { key: 'late', header: 'Late', align: 'right', width: 64, render: (p) => <NumberCell>{p.late}</NumberCell> },
]

export default function DailyProductionReport() {
  const { history, catalog } = useTrade()
  const [rangeName, setRangeName] = useState<(typeof RANGES)[number]>('30 days')
  const [pens, setPens] = useState<(typeof PEN_FILTERS)[number]>('All pens')
  const today = todayISO()
  // Complete days only: the period ends yesterday.
  const end = addDays(today, -1)
  const range: Range = rangeName === 'This month' ? period('month', today) : period(rangeName === '7 days' ? '7d' : rangeName === '30 days' ? '30d' : '90d', end)
  const before = previous(range)
  const lays = (penId: number) => catalog.pens.find((p) => p.id === penId)?.bird_types?.lays_eggs ?? false
  const penOk = (penId: number) => pens === 'All pens' || (pens === 'Layers') === lays(penId)
  const entries = rowsIn(history.daily, range, penOk)
  const prevEntries = rowsIn(history.daily, before, penOk)

  const rows: PenRow[] = catalog.pens
    .filter((p) => penOk(p.id))
    .map((p) => {
      const mine = entries.filter((d) => d.penId === p.id)
      // Days a flock was in the pen during the range.
      const flocks = history.flocks.filter((f) => f.pen_id === p.id && f.placed_on <= range.to && (!f.closed_on || f.closed_on >= range.from))
      const days = new Set(flocks.flatMap((f) => datesBetween(f.placed_on > range.from ? f.placed_on : range.from, f.closed_on && f.closed_on < range.to ? f.closed_on : range.to))).size
      const ages = mine.map((d) => Math.floor(d.ageDays / 7))
      const latest = [...mine].sort((a, b) => b.date.localeCompare(a.date))[0]
      const mort = mortalityPct(mine) ?? 0
      const layers = lays(p.id)
      return {
        pen: p.id,
        name: p.name,
        layers,
        flock: flocks.map((f) => f.code).join(', '),
        weeks: ages.length ? (Math.min(...ages) === Math.max(...ages) ? `week ${Math.min(...ages)}` : `weeks ${Math.min(...ages)}–${Math.max(...ages)}`) : '',
        recorded: mine.length,
        days,
        crates: layers ? mine.reduce((n, d) => n + (d.eggs ?? 0), 0) / farmSettings.eggsPerCrate : null,
        laying: layers ? layingRate(mine) : null,
        ageDays: latest ? latest.ageDays : null,
        died: mine.reduce((n, d) => n + d.mortality, 0),
        mortalityPct: mort,
        feedBags: mine.reduce((n, d) => n + d.feedBags, 0),
        vsExpected: feedVariance(mine),
        late: mine.filter(isLate).length,
        flag: mine.some((d) => (d.mortalityPct ?? 0) > farmSettings.mortalityAlertPct),
      }
    })
    .filter((r) => r.days > 0 || r.recorded > 0)

  const crates = rows.reduce((n, p) => n + (p.crates ?? 0), 0)
  const died = rows.reduce((n, p) => n + p.died, 0)
  const feed = rows.reduce((n, p) => n + p.feedBags, 0)
  const late = rows.reduce((n, p) => n + p.late, 0)
  const expected = rows.reduce((n, p) => n + p.days, 0)
  const recorded = rows.reduce((n, p) => n + p.recorded, 0)
  const missing = Math.max(0, expected - recorded)

  const dates = datesBetween(range.from, range.to)
  const layingDates = dates.filter((d) => rowsOn(history.daily, d, (id) => lays(id) && penOk(id)).some((x) => x.eggs !== null))
  const laying = series(layingDates, (d) => layingRate(rowsOn(history.daily, d, (id) => lays(id) && penOk(id))))
  const yTicks = ticksFor(laying)
  const last = laying[laying.length - 1]
  const eggsPrev = prevEntries.reduce((n, d) => n + (d.eggs ?? 0), 0) / farmSettings.eggsPerCrate
  const worst = [...rows].sort((a, b) => b.mortalityPct - a.mortalityPct).filter((r) => r.died > 0).slice(0, 2)
  const spark = (f: (d: string) => number | null) => series(dates.slice(-8), f)
  const layerPens = rows.filter((r) => r.layers).length

  const kpis = [
    kpi({ label: 'Eggs collected', value: formatNumber(Math.round(crates)), unit: 'crates', current: crates, previous: eggsPrev, context: 'vs previous period', info: 'Crates collected across layer pens', spark: spark((d) => rowsOn(history.daily, d, penOk).reduce((n, x) => n + (x.eggs ?? 0), 0)) }),
    kpi({ label: 'Laying rate', value: num(layingRate(entries) ?? 0, 1), unit: '%', current: layingRate(entries), previous: layingRate(prevEntries), points: true, digits: 1, context: `${layerPens} layer ${layerPens === 1 ? 'pen' : 'pens'}, average`, info: 'Eggs ÷ hens over the period', spark: spark((d) => layingRate(rowsOn(history.daily, d, penOk))) }),
    kpi({ label: 'Mortality', value: formatNumber(died), unit: 'birds', current: mortalityPct(entries), previous: mortalityPct(prevEntries), points: true, goodWhen: 'down', context: worst.length ? `highest: ${worst.map((w) => `Pen ${w.pen}`).join(' and ')}` : 'no deaths', info: 'Birds lost over the period; change is in % of birds', spark: spark((d) => rowsOn(history.daily, d, penOk).reduce((n, x) => n + x.mortality, 0)) }),
    kpi({ label: 'Entries on time', value: formatNumber(recorded - late), unit: `of ${formatNumber(expected)}`, current: null, previous: null, goodWhen: 'neither', context: `${late} late · ${missing} missing`, info: 'Pen-day entries recorded on the day', spark: FLAT }),
  ]

  const exportRows = () =>
    downloadCsv(
      `daily-production-${range.from}-to-${range.to}`,
      ['Pen', 'Flock', 'Weeks', 'Recorded', 'Days', 'Eggs (crates)', 'Laying %', 'Age (days)', 'Died', 'Mortality %', 'Feed (bags)', 'Feed vs expected %', 'Late'],
      rows.map((r) => [r.name, r.flock, r.weeks, r.recorded, r.days, r.crates === null ? '' : Math.round(r.crates), r.laying?.toFixed(1), r.layers ? '' : r.ageDays, r.died, r.mortalityPct.toFixed(2), r.feedBags, r.vsExpected?.toFixed(1), r.late]),
    )

  return (
    <>
      <ReportHeader title="Daily production" description="Every pen-day entry over a period, rolled up by pen. Use it for the weekly farm meeting or to compare flocks." onExport={exportRows} />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Range" options={RANGES} value={rangeName} onChange={setRangeName} />
        <Select label="Pens" leadingIcon={Warehouse} width={170} options={PEN_FILTERS} value={pens} onChange={setPens} />
        <span className="flex-1" />
        <span className="type-body-sm text-fg-tertiary">
          {dayMonth(range.from)} – {dayMonth(range.to)} · {rangeName === 'This month' ? 'includes today' : 'complete days only'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      {pens !== 'Broilers' && (
        <Card className="gap-4 px-5 pt-4 pb-5">
          <div className="flex items-baseline gap-2">
            <h2 className="type-h3 text-fg-primary">Laying rate</h2>
            <span className="type-body-sm text-fg-tertiary">Layers · % of hens laying each day</span>
          </div>
          {laying.length > 1 ? (
            <div className="relative">
              <LineChart series={[{ label: 'Farm', values: laying, color: 'var(--ayk-color-chart-1)', endDot: true }]} yTicks={yTicks} formatY={(v) => `${v}%`} xLabels={axisLabels(layingDates)} />
              <span className="absolute right-2 type-label-sm text-fg-success" style={{ top: `${((Math.max(...yTicks) - last) / (Math.max(...yTicks) - Math.min(...yTicks))) * 200 + 8}px` }}>
                {last.toFixed(1)}%
              </span>
            </div>
          ) : (
            <p className="type-body-md text-fg-tertiary">Not enough layer entries in this range to draw a line.</p>
          )}
          <p className="type-body-sm text-fg-secondary">No breed-standard curve is stored yet, so the line shows the farm’s own figures only.</p>
        </Card>
      )}

      <Card>
        <CardHeader title={`By pen · ${range.label.toLowerCase()}`} meta={<span className="type-body-sm text-fg-tertiary">Broiler rows show the flock’s age at its latest entry (no weights are recorded)</span>} action={{ label: 'Export', onClick: exportRows }} />
        <Table columns={columns} rows={rows} rowKey={(p) => String(p.pen)} />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-b-xl bg-canvas px-5 py-3 type-label-md">
          <span className="flex-1 text-fg-primary">
            {pens === 'All pens' ? 'Farm total' : pens} · {range.label.toLowerCase()}
          </span>
          <span className="text-fg-secondary">{formatNumber(Math.round(crates))} crates</span>
          <span className="text-fg-secondary">{formatNumber(died)} died</span>
          <span className="text-fg-secondary">{formatNumber(feed)} bags feed</span>
          <span className="text-fg-secondary">
            {late} late · {missing} missing
          </span>
        </div>
      </Card>
    </>
  )
}
