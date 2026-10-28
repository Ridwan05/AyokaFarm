'use client'

import { Pill, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Card, CardHeader } from '../../components/ui/Card'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { KpiCard } from '../../components/ui/KpiCard'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { medications } from '../../data/inventory'
import { medicationReportKpis, medMovements, withdrawalTracker, type MedMovement } from '../../data/reports'
import { formatNaira, formatNumber } from '../../lib/format'
import { ReportHeader } from './ReportHeader'

const RANGES = ['7 days', '30 days', 'This month', 'Custom'] as const
const kindTone: Record<MedMovement['kind'], Tone> = { Used: 'neutral', Received: 'success', 'Written off': 'danger' }

type Row = MedMovement & { balance: number }

/** Walk each batch back from today's stock so every row shows the batch balance after it. */
function withBatchBalances(rows: MedMovement[]): Row[] {
  const current = new Map(medications.map((m) => [m.batch, m.stock]))
  return rows.map((r) => {
    const after = current.get(r.batch) ?? 0
    current.set(r.batch, after - r.qty)
    return { ...r, balance: after }
  })
}

const qty = (n: number, unit: string) => `${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n))} ${unit === 'vials' && Math.abs(n) === 1 ? 'vial' : unit}`

const columns: Column<Row>[] = [
  { key: 'date', header: 'Date', width: 72, render: (r) => <TextCell>{r.date}</TextCell> },
  { key: 'med', header: 'Medication', render: (r) => <TextCell tone="primary">{r.medication}</TextCell> },
  { key: 'batch', header: 'Batch', width: 96, render: (r) => <TextCell mono>{r.batch}</TextCell> },
  { key: 'pen', header: 'Pen', width: 72, render: (r) => <TextCell>{r.pen ? `Pen ${r.pen}` : '—'}</TextCell> },
  {
    key: 'kind',
    header: 'Movement',
    width: 120,
    render: (r) => (
      <Badge dot tone={kindTone[r.kind]}>
        {r.kind}
      </Badge>
    ),
  },
  { key: 'qty', header: 'Qty', align: 'right', width: 88, render: (r) => <NumberCell tone={r.qty > 0 ? 'success' : 'default'}>{qty(r.qty, r.unit)}</NumberCell> },
  { key: 'balance', header: 'Batch balance', align: 'right', width: 120, render: (r) => <NumberCell>{formatNumber(r.balance)} {r.unit}</NumberCell> },
  { key: 'note', header: 'Withdrawal / note', width: 200, render: (r) => <TextCell>{r.note ?? '—'}</TextCell> },
  { key: 'by', header: 'By', width: 64, render: (r) => <TextCell>{r.by}</TextCell> },
]

export default function MedicationLedgerReport() {
  const [range, setRange] = useState<(typeof RANGES)[number]>('30 days')
  const [med, setMed] = useState('All medications')
  const [pen, setPen] = useState('All pens')
  const all = withBatchBalances(medMovements)
  const rows = all
    .filter((r) => med === 'All medications' || r.medication === med)
    .filter((r) => pen === 'All pens' || r.pen === Number(pen.split(' ')[1]))

  const costByPen = [1, 2, 3, 4, 5, 6]
    .map((p) => ({ pen: p, cost: medMovements.filter((m) => m.pen === p && m.kind === 'Used').reduce((n, m) => n + m.cost, 0) }))
    .sort((a, b) => b.cost - a.cost)
  const maxCost = Math.max(...costByPen.map((c) => c.cost), 1)
  const w = withdrawalTracker

  return (
    <>
      <ReportHeader title="Medication ledger" description="Every batch received, dose given and count adjusted, with withdrawal dates and what treatment cost each pen." />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Range" options={RANGES} value={range} onChange={setRange} />
        <Select label="Medication" leadingIcon={Pill} width={200} options={['All medications', ...medications.map((m) => m.name)]} value={med} onChange={setMed} />
        <Select label="Pen" leadingIcon={Warehouse} width={170} options={['All pens', 'Pen 1', 'Pen 2', 'Pen 3', 'Pen 4', 'Pen 5', 'Pen 6']} value={pen} onChange={setPen} />
        <span className="flex-1" />
        <span className="type-body-sm text-fg-tertiary">10 Sep – 9 Oct</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {medicationReportKpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="min-w-0 flex-1 px-5 pt-4 pb-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Cost by pen</h2>
            <span className="type-body-sm text-fg-tertiary">30 days · flows into Profit & loss (FR-MED-4)</span>
          </div>
          <ul className="flex flex-col">
            {costByPen.map((c) => (
              <li key={c.pen} className="flex h-9 items-center gap-4">
                <span className="w-[52px] shrink-0 type-label-md text-fg-primary">Pen {c.pen}</span>
                <span className="h-2.5 flex-1 rounded-xs bg-subtle">
                  <span className="block h-2.5 rounded-xs bg-chart-1" style={{ width: `${(c.cost / maxCost) * 82}%` }} />
                </span>
                <span className={`w-[90px] shrink-0 text-right type-numeric-md ${c.cost ? 'text-fg-primary' : 'text-fg-tertiary'}`}>{formatNaira(c.cost)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="w-full shrink-0 lg:w-[380px] gap-0 px-5 pt-4 pb-5">
          <h2 className="pb-3 type-h3 text-fg-primary">Withdrawal tracker</h2>
          <div className="flex items-start gap-2">
            <div className="flex flex-1 flex-col">
              <span className="type-label-md text-fg-primary">
                Pen {w.pen} · {w.medication}
              </span>
              <span className="type-body-sm text-fg-tertiary">
                Last dose {w.lastDose} · {w.days}-day withdrawal
              </span>
            </div>
            <Badge dot tone="info">
              Day {w.day} of {w.days}
            </Badge>
          </div>
          <div className="my-3 h-1.5 rounded-full bg-subtle">
            <div className="h-1.5 rounded-full bg-icon-info" style={{ width: `${(w.day / w.days) * 100}%` }} />
          </div>
          <KeyValueRow label="Eggs kept apart">Marked crates</KeyValueRow>
          <KeyValueRow label={`Sales from Pen ${w.pen}`}>Warning shown</KeyValueRow>
          <KeyValueRow label="Clear to sell from" strong calculated>
            {w.clearFrom}
          </KeyValueRow>
          <p className="pt-2 type-body-sm text-fg-secondary">
            Withdrawal days come from each medication’s settings (BRD §7.3) and the last dose in the pen’s entries.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Movements" meta={<span className="type-body-sm text-fg-tertiary">Newest first · used first-expiry-first-out</span>} />
        <Table columns={columns} rows={rows} rowKey={(r) => `${r.date}-${r.batch}-${r.pen}-${r.kind}`} />
      </Card>
    </>
  )
}
