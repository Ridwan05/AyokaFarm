'use client'

import { Egg } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DivergingBars } from '../../components/charts/DivergingBars'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Card, CardHeader } from '../../components/ui/Card'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { KpiCard } from '../../components/ui/KpiCard'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, PrimaryCell, Table, type Column } from '../../components/ui/Table'
import { broilerNote, penPL, plKpis, plNote, unitCosts, type PenPL } from '../../data/reports'
import { formatNumber } from '../../lib/format'
import { ReportHeader } from './ReportHeader'

const PERIODS = ['September', 'Q3 2026', 'Year to date'] as const
const TYPES = ['Layers', 'Broilers'] as const

const marginOf = (p: PenPL) => p.revenue - p.feed - p.medication - p.birdCost - p.overhead
const m = (n: number) => `₦ ${n.toFixed(2)}M`
const signedM = (n: number) => `${n < 0 ? '−' : '+'}₦${Math.abs(n).toFixed(2)}M`

const columns: Column<PenPL>[] = [
  { key: 'pen', header: 'Pen', render: (p) => <PrimaryCell initials={`P${p.pen}`} title={`Pen ${p.pen} · Layers`} subtitle={`${p.flock} · ${p.weeks}`} /> },
  { key: 'revenue', header: 'Revenue', align: 'right', width: 120, render: (p) => <NumberCell>{m(p.revenue)}</NumberCell> },
  { key: 'feed', header: 'Feed used', align: 'right', width: 120, render: (p) => <NumberCell>{m(p.feed)}</NumberCell> },
  { key: 'med', header: 'Medication', align: 'right', width: 110, render: (p) => <NumberCell>{m(p.medication)}</NumberCell> },
  { key: 'bird', header: 'Bird cost', align: 'right', width: 110, render: (p) => <NumberCell>{m(p.birdCost)}</NumberCell> },
  { key: 'overhead', header: 'Overhead', align: 'right', width: 110, render: (p) => <NumberCell>{m(p.overhead)}</NumberCell> },
  {
    key: 'margin',
    header: 'Margin',
    align: 'right',
    width: 120,
    render: (p) => {
      const v = marginOf(p)
      return <NumberCell tone={v < 0 ? 'danger' : 'success'}>{v < 0 ? `−₦ ${Math.abs(v).toFixed(2)}M` : m(v)}</NumberCell>
    },
  },
  {
    key: 'pct',
    header: 'Margin %',
    align: 'right',
    width: 92,
    render: (p) => {
      const pct = (marginOf(p) / p.revenue) * 100
      return <NumberCell tone={pct < 0 ? 'danger' : 'default'}>{pct < 0 ? `−${Math.abs(pct).toFixed(1)}` : pct.toFixed(1)}%</NumberCell>
    },
  },
]

export default function ProfitLoss() {
  const router = useRouter()
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('September')
  const [type, setType] = useState<(typeof TYPES)[number]>('Layers')
  const rows = [...penPL].sort((a, b) => marginOf(b) - marginOf(a))
  const revenue = rows.reduce((n, p) => n + p.revenue, 0)
  const margin = rows.reduce((n, p) => n + marginOf(p), 0)
  const hasData = period === 'September' && type === 'Layers'

  return (
    <>
      <ReportHeader
        title="Profit & loss"
        description="September 2026, by pen. Margin counts feed and medication used, not bought, so a big delivery never looks like a loss."
      />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        <Select label="Bird type" leadingIcon={Egg} width={160} options={TYPES} value={type} onChange={setType} />
        <span className="flex-1" />
        <span className="type-body-sm text-fg-tertiary">Overhead shared by bird-days · bird cost spread over the flock’s life</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {plKpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {!hasData ? (
        type === 'Broilers' ? (
          <Alert title={broilerNote.title} action={<AlertAction onClick={() => router.push('/pens')}>See closed flocks</AlertAction>}>
            {broilerNote.body}
          </Alert>
        ) : (
          <Card className="items-center p-12">
            <p className="type-body-md text-fg-tertiary">The sample data only has September figures.</p>
          </Card>
        )
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:flex-row">
            <Card className="min-w-0 flex-1 px-5 pt-4 pb-5">
              <div className="flex items-baseline gap-2 pb-2">
                <h2 className="type-h3 text-fg-primary">Margin by pen</h2>
                <span className="type-body-sm text-fg-tertiary">September · ₦ millions</span>
              </div>
              <DivergingBars
                rows={rows.map((p) => {
                  const v = marginOf(p)
                  return {
                    label: `Pen ${p.pen}`,
                    value: v,
                    color: v < 0 ? 'var(--ayk-color-chart-4)' : 'var(--ayk-color-chart-1)',
                    display: <span className={`type-numeric-md ${v < 0 ? 'text-fg-danger' : 'text-fg-success'}`}>{signedM(v)}</span>,
                  }
                })}
              />
              <p className="pt-2 type-body-sm text-fg-secondary">{plNote}</p>
            </Card>
            <Card className="w-full shrink-0 lg:w-[400px] gap-0 px-5 pt-4 pb-5">
              <div className="flex items-baseline gap-2 pb-2">
                <h2 className="type-h3 text-fg-primary">Cost per output</h2>
                <span className="type-body-sm text-fg-tertiary">Layers · September</span>
              </div>
              <KeyValueRow label="Cost to produce a crate" calculated>
                ₦ {formatNumber(unitCosts.costPerCrate)}
              </KeyValueRow>
              <KeyValueRow label="Average selling price" calculated>
                ₦ {formatNumber(unitCosts.sellingPrice)}
              </KeyValueRow>
              <KeyValueRow label="Feed per crate" calculated>
                {unitCosts.feedPerCrateKg} kg
              </KeyValueRow>
              <KeyValueRow label="Feed cost per bird" calculated>
                ₦ {formatNumber(unitCosts.feedCostPerBird)}
              </KeyValueRow>
              <KeyValueRow label="Margin per crate" strong>
                ₦ {formatNumber(unitCosts.sellingPrice - unitCosts.costPerCrate)}
              </KeyValueRow>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="By pen · September 2026"
              meta={<span className="type-body-sm text-fg-tertiary">Layers</span>}
              action={{ label: 'How this is calculated', to: '/settings' }}
            />
            <Table columns={columns} rows={rows} rowKey={(p) => String(p.pen)} />
            <div className="flex items-center gap-6 rounded-b-xl bg-canvas px-5 py-3 type-label-md">
              <span className="flex-1 text-fg-primary">All layer pens</span>
              <span className="text-fg-secondary">Revenue ₦{revenue.toFixed(2)}M</span>
              <span className="text-fg-secondary">Costs ₦{(revenue - margin).toFixed(2)}M</span>
              <span className="text-fg-secondary">
                Margin ₦{margin.toFixed(2)}M ({((margin / revenue) * 100).toFixed(1)}%)
              </span>
            </div>
          </Card>

          <Alert title={broilerNote.title} action={<AlertAction onClick={() => router.push('/pens')}>See closed flocks</AlertAction>}>
            {broilerNote.body}
          </Alert>
        </>
      )}
    </>
  )
}
