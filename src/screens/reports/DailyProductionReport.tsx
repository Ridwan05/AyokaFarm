'use client'

import { Warehouse } from 'lucide-react'
import { useState } from 'react'
import { LineChart } from '../../components/charts/LineChart'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, PrimaryCell, Table, type Column } from '../../components/ui/Table'
import { layingSeries, penProduction, productionReportKpis, type PenProduction } from '../../data/reports'
import { formatNumber, formatSignedPct } from '../../lib/format'
import { ReportHeader } from './ReportHeader'

const RANGES = ['7 days', '30 days', 'This month', 'Custom'] as const
const PEN_FILTERS = ['All pens', 'Layers', 'Broilers'] as const
const dash = <NumberCell tone="muted">—</NumberCell>

const columns: Column<PenProduction>[] = [
  { key: 'pen', header: 'Pen', render: (p) => <PrimaryCell initials={`P${p.pen}`} title={`Pen ${p.pen} · ${p.type}`} subtitle={`${p.flock} · ${p.weeks}`} /> },
  { key: 'recorded', header: 'Recorded', align: 'right', width: 110, render: (p) => <NumberCell tone={p.recorded < p.days ? 'danger' : 'default'}>{p.recorded} / {p.days}</NumberCell> },
  { key: 'eggs', header: 'Eggs', align: 'right', width: 85, render: (p) => (p.crates === null ? dash : <NumberCell>{formatNumber(p.crates)} cr</NumberCell>) },
  { key: 'laying', header: 'Laying · weight', align: 'right', width: 120, render: (p) => <NumberCell>{p.layingOrWeight}</NumberCell> },
  { key: 'died', header: 'Died', align: 'right', width: 72, render: (p) => <NumberCell tone={p.flag ? 'warning' : 'default'}>{p.died}</NumberCell> },
  { key: 'mortality', header: 'Mortality', align: 'right', width: 92, render: (p) => <NumberCell tone={p.flag ? 'warning' : 'default'}>{p.mortalityPct.toFixed(1)}%</NumberCell> },
  { key: 'feed', header: 'Feed', align: 'right', width: 96, render: (p) => <NumberCell>{p.feedBags} bags</NumberCell> },
  { key: 'vs', header: 'vs expected', align: 'right', width: 104, render: (p) => <NumberCell tone={Math.abs(p.vsExpected) >= 5 && p.vsExpected > 0 ? 'warning' : 'default'}>{formatSignedPct(p.vsExpected)}</NumberCell> },
  { key: 'late', header: 'Late', align: 'right', width: 64, render: (p) => <NumberCell>{p.late}</NumberCell> },
]

export default function DailyProductionReport() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('30 days')
  const [pens, setPens] = useState<(typeof PEN_FILTERS)[number]>('All pens')
  const rows = penProduction.filter((p) => pens === 'All pens' || p.type === pens)
  const crates = rows.reduce((n, p) => n + (p.crates ?? 0), 0)
  const died = rows.reduce((n, p) => n + p.died, 0)
  const feed = rows.reduce((n, p) => n + p.feedBags, 0)
  const late = rows.reduce((n, p) => n + p.late, 0)
  const missing = rows.reduce((n, p) => n + (p.days - p.recorded), 0)
  const last = layingSeries.farm[layingSeries.farm.length - 1]

  return (
    <>
      <ReportHeader title="Daily production" description="Every pen-day entry over a period, rolled up by pen. Use it for the weekly farm meeting or to compare flocks." />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Range" options={RANGES} value={range} onChange={setRange} />
        <Select label="Pens" leadingIcon={Warehouse} width={170} options={PEN_FILTERS} value={pens} onChange={setPens} />
        <span className="flex-1" />
        <span className="type-body-sm text-fg-tertiary">9 Sep – 8 Oct · complete days only</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {productionReportKpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <Card className="gap-4 px-5 pt-4 pb-5">
        <div className="flex items-baseline gap-2">
          <h2 className="type-h3 text-fg-primary">Laying rate vs breed standard</h2>
          <span className="type-body-sm text-fg-tertiary">Layers · % of hens laying each day</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5 type-body-sm text-fg-secondary">
            <span className="h-0.5 w-4 bg-chart-1" />
            Farm (4 layer pens)
          </span>
          <span className="flex items-center gap-1.5 type-body-sm text-fg-secondary">
            <span className="h-0.5 w-4 bg-chart-5" />
            Breed standard (Isa Brown, flock mix)
          </span>
        </div>
        <div className="relative">
          <LineChart
            series={[
              { label: 'Breed standard', values: layingSeries.standard, color: 'var(--ayk-color-chart-5)', dashed: true },
              { label: 'Farm', values: layingSeries.farm, color: 'var(--ayk-color-chart-1)', endDot: true },
            ]}
            yTicks={layingSeries.yTicks}
            formatY={(v) => `${v}%`}
            xLabels={layingSeries.xLabels}
          />
          <span className="absolute right-2 type-label-sm text-fg-success" style={{ top: `${((92 - last) / 12) * 200 + 8}px` }}>
            {last}%
          </span>
        </div>
        <p className="type-body-sm text-fg-secondary">{layingSeries.note}</p>
      </Card>

      <Card>
        <CardHeader title="By pen · last 30 days" meta={<span className="type-body-sm text-fg-tertiary">Broiler rows show average weight from weekly sample weighing (probe G1)</span>} />
        <Table columns={columns} rows={rows} rowKey={(p) => String(p.pen)} />
        <div className="flex items-center gap-6 rounded-b-xl bg-canvas px-5 py-3 type-label-md">
          <span className="flex-1 text-fg-primary">{pens === 'All pens' ? 'Farm total' : pens} · 30 days</span>
          <span className="text-fg-secondary">{formatNumber(crates)} crates</span>
          <span className="text-fg-secondary">{died} died</span>
          <span className="text-fg-secondary">{feed} bags feed</span>
          <span className="text-fg-secondary">
            {late} late · {missing} missing
          </span>
        </div>
      </Card>
    </>
  )
}
