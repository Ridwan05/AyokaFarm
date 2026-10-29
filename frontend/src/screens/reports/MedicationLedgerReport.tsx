'use client'

import { Pill, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Card, CardHeader } from '../../components/ui/Card'
import { InfoTip } from '../../components/ui/InfoTip'
import { explain } from '../../data/explain'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { KpiCard } from '../../components/ui/KpiCard'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { addDays, dayMonth, dm, inRange, kpi, medicationUnitCost, nairaKpi, naira, period, todayISO, weekdayDayMonth, withdrawals, type Range } from '../../data/metrics'
import { useTrade } from '../../data/tradeContext'
import { downloadCsv } from '../../lib/export'
import { formatNaira, formatNumber } from '../../lib/format'
import { ReportHeader } from './ReportHeader'

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

const RANGES = ['7 days', '30 days', 'This month', '90 days'] as const
type Kind = 'Used' | 'Received' | 'Written off' | 'Counted' | 'Opening'
const kindTone: Record<Kind, Tone> = { Used: 'neutral', Received: 'success', 'Written off': 'danger', Counted: 'warning', Opening: 'neutral' }

type Row = {
  id: number
  date: string
  medicationId: number
  medication: string
  batch: string
  pen: number | null
  kind: Kind
  /** Signed quantity */
  qty: number
  unit: string
  /** ₦ value of the movement (cost charged to the pen for Used) */
  cost: number
  note: string | null
  by: string
  balance: number
}

const qty = (n: number, unit: string) => `${n > 0 ? '+' : '−'}${formatNumber(Math.abs(n))} ${unit === 'vials' && Math.abs(n) === 1 ? 'vial' : unit}`

const columns: Column<Row>[] = [
  { key: 'date', header: 'Date', width: 72, render: (r) => <TextCell>{dm(r.date)}</TextCell> },
  { key: 'med', header: 'Medication', render: (r) => <TextCell tone="primary">{r.medication}</TextCell> },
  { key: 'batch', header: 'Batch', width: 110, render: (r) => <TextCell mono>{r.batch}</TextCell> },
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
  { key: 'qty', header: 'Qty', align: 'right', width: 96, render: (r) => <NumberCell tone={r.qty > 0 ? 'success' : 'default'}>{qty(r.qty, r.unit)}</NumberCell> },
  { key: 'balance', header: 'Batch balance', align: 'right', width: 120, render: (r) => <NumberCell>{formatNumber(r.balance)} {r.unit}</NumberCell> },
  { key: 'note', header: 'Withdrawal / note', width: 200, render: (r) => <TextCell>{r.note ?? '—'}</TextCell> },
  { key: 'by', header: 'By', width: 72, render: (r) => <TextCell>{r.by}</TextCell> },
]

export default function MedicationLedgerReport() {
  const { history, catalog, stockOf } = useTrade()
  const [rangeName, setRangeName] = useState<(typeof RANGES)[number]>('30 days')
  const [med, setMed] = useState('All medications')
  const [pen, setPen] = useState('All pens')
  const today = todayISO()
  const range: Range = rangeName === 'This month' ? period('month', today) : period(rangeName === '7 days' ? '7d' : rangeName === '30 days' ? '30d' : '90d', today)

  const meds = new Map(catalog.medications.map((m) => [m.id, m]))
  const unitOf = (id: number) => {
    const u = meds.get(id)?.stock_unit ?? ''
    return u === 'vial' ? 'vials' : u
  }
  const batchNo = new Map(catalog.batches.map((b) => [b.purchaseId, b.batchNo]))
  const purchaseBatch = new Map(history.purchases.map((p) => [p.id, p.batch_no]))
  const staffName = new Map(catalog.profiles.map((p) => [p.id, p.full_name.split(' ')[0]]))
  const reasonName = new Map(catalog.reasons.map((r) => [r.id, r.name]))

  // Walk each batch back from what's on hand now, so each row shows the balance after it.
  // Stock without a purchase (opening stock) is its own "batch".
  const onHand = new Map<string, number>()
  for (const m of catalog.medications) {
    const batches = catalog.batches.filter((b) => b.medicationId === m.id)
    for (const b of batches) onHand.set(`${m.id}|${b.purchaseId}`, b.onHand)
    onHand.set(`${m.id}|null`, stockOf(m.name) - batches.reduce((n, b) => n + b.onHand, 0))
  }

  const all: Row[] = history.medMovements.map((x) => {
    const medicationId = x.medication_id!
    const key = `${medicationId}|${x.purchase_id ?? 'null'}`
    const after = onHand.get(key) ?? 0
    const q = Number(x.quantity)
    onHand.set(key, after - q)
    const m = meds.get(medicationId)
    let kind: Kind = x.movement === 'received' ? 'Received' : x.movement === 'opening' ? 'Opening' : x.movement === 'used' ? 'Used' : q < 0 ? 'Written off' : 'Counted'
    let note: string | null = null
    let by = '—'
    if (x.movement === 'used') {
      const line = history.medLines.find((l) => l.medicationId === medicationId && l.penId === x.pen_id && l.date === x.moved_on)
      by = line?.recordedBy.split(' ')[0] ?? '—'
      const days = m?.withdrawal_days ?? 0
      if (days > 0) {
        const clear = addDays(x.moved_on, days + 1)
        note = clear > today ? `Withdrawal to ${weekdayDayMonth(addDays(clear, -1))}` : `${days}-day withdrawal, ended ${dm(addDays(clear, -1))}`
      }
    } else if (x.source_table === 'stock_adjustments') {
      const a = history.adjustments.find((y) => y.id === x.source_id)
      if (a) {
        by = staffName.get(a.recorded_by) ?? '—'
        note = [a.is_opening ? 'Opening stock' : reasonName.get(a.reason_id ?? -1), a.note].filter(Boolean).join(' · ') || null
        if (a.is_opening) kind = 'Opening'
      }
    } else if (x.source_table === 'purchases') {
      const p = history.purchases.find((y) => y.id === x.source_id)
      if (p) {
        by = staffName.get(p.received_by ?? p.recorded_by) ?? '—'
        note = `${p.ref} · ${catalog.suppliers.find((s) => s.id === p.supplier_id)?.short_name ?? catalog.suppliers.find((s) => s.id === p.supplier_id)?.name ?? ''}`
      }
    }
    const unitCost = medicationUnitCost(history, medicationId, x.purchase_id)
    return {
      id: x.id,
      date: x.moved_on,
      medicationId,
      medication: m?.name ?? '—',
      batch: x.purchase_id ? (batchNo.get(x.purchase_id) ?? purchaseBatch.get(x.purchase_id) ?? '—') : 'Opening',
      pen: x.pen_id,
      kind,
      qty: q,
      unit: unitOf(medicationId),
      cost: Math.abs(q) * unitCost,
      note,
      by,
      balance: after,
    }
  })

  const inPeriod = all.filter((r) => inRange(r.date, range))
  const rows = inPeriod.filter((r) => med === 'All medications' || r.medication === med).filter((r) => pen === 'All pens' || r.pen === Number(pen.split(' ')[1]))
  const used = inPeriod.filter((r) => r.kind === 'Used')
  const usedCost = used.reduce((n, r) => n + r.cost, 0)
  const treatedPens = [...new Set(used.map((r) => r.pen).filter((p): p is number => p !== null))].sort((a, b) => a - b)
  const writtenOff = inPeriod.filter((r) => r.kind === 'Written off')
  const inForce = withdrawals(history, catalog, today)

  const costByPen = catalog.pens.map((p) => ({ pen: p.id, cost: used.filter((r) => r.pen === p.id).reduce((n, r) => n + r.cost, 0) })).sort((a, b) => b.cost - a.cost)
  const maxCost = Math.max(...costByPen.map((c) => c.cost), 1)
  const list = (pens: number[]) => (pens.length <= 1 ? `Pen ${pens[0]}` : `Pens ${pens.slice(0, -1).join(', ')} and ${pens[pens.length - 1]}`)

  const kpis = [
    kpi({ label: 'Medication used', ...nairaKpi(usedCost), current: null, previous: null, goodWhen: 'neither', context: 'added to pen costs', info: 'Each dose given in the period × the cost a unit of its batch (purchase price ÷ units bought).', spark: FLAT }),
    kpi({ label: 'Treatments', value: String(used.length), unit: 'given', current: null, previous: null, goodWhen: 'neither', context: treatedPens.length ? list(treatedPens) : 'none in this range', info: 'Medication lines saved in daily entries during the period.', spark: FLAT }),
    kpi({ label: 'Written off', value: String(writtenOff.length), unit: writtenOff.length === 1 ? 'adjustment' : 'adjustments', current: null, previous: null, goodWhen: 'neither', context: writtenOff.length ? naira(writtenOff.reduce((n, r) => n + r.cost, 0)) : 'nothing written off', info: 'Stock adjustments that took medication out of stock (counts, breakage, expiry) in the period.', spark: FLAT }),
    kpi({ label: 'Withdrawals in force', value: String(inForce.length), unit: inForce.length === 1 ? 'pen' : 'pens', current: null, previous: null, goodWhen: 'neither', context: inForce.length ? inForce.map((w) => `Pen ${w.penId} to ${dayMonth(w.clearFrom)}`).join(' · ') : 'all pens clear', info: 'Pens where the last dose + the medication’s withdrawal days hasn’t passed yet.', spark: FLAT }),
  ]

  const exportRows = () =>
    downloadCsv(
      `medication-ledger-${range.from}-to-${range.to}`,
      ['Date', 'Medication', 'Batch', 'Pen', 'Movement', 'Quantity', 'Unit', 'Batch balance', 'Value (₦)', 'Withdrawal / note', 'By'],
      rows.map((r) => [r.date, r.medication, r.batch, r.pen, r.kind, r.qty, r.unit, r.balance, Math.round(r.cost), r.note, r.by]),
    )

  return (
    <>
      <ReportHeader title="Medication ledger" description="Every batch received, dose given and count adjusted, with withdrawal dates and what treatment cost each pen." onExport={exportRows} />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Range" options={RANGES} value={rangeName} onChange={setRangeName} />
        <Select label="Medication" leadingIcon={Pill} width={200} options={['All medications', ...catalog.medications.map((m) => m.name)]} value={med} onChange={setMed} />
        <Select label="Pen" leadingIcon={Warehouse} width={170} options={['All pens', ...catalog.pens.map((p) => `Pen ${p.id}`)]} value={pen} onChange={setPen} />
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
            <h2 className="flex items-center gap-1.5 type-h3 text-fg-primary">
              Cost by pen
              <InfoTip label="Cost by pen">{explain.medicationCost()} Added up for each pen over the range.</InfoTip>
            </h2>
            <span className="type-body-sm text-fg-tertiary">{range.label} · flows into Profit & loss (FR-MED-4)</span>
          </div>
          <ul className="flex flex-col">
            {costByPen.map((c) => (
              <li key={c.pen} className="flex h-9 items-center gap-4">
                <span className="w-[52px] shrink-0 type-label-md text-fg-primary">Pen {c.pen}</span>
                <span className="h-2.5 flex-1 rounded-xs bg-subtle">
                  <span className="block h-2.5 rounded-xs bg-chart-1" style={{ width: `${(c.cost / maxCost) * 82}%` }} />
                </span>
                <span className={`w-[90px] shrink-0 text-right type-numeric-md ${c.cost ? 'text-fg-primary' : 'text-fg-tertiary'}`}>{formatNaira(Math.round(c.cost))}</span>
              </li>
            ))}
          </ul>
          {!used.length && <p className="pt-2 type-body-sm text-fg-tertiary">No doses recorded in this range.</p>}
        </Card>
        <Card className="w-full shrink-0 lg:w-[380px] gap-0 px-5 pt-4 pb-5">
          <h2 className="pb-3 type-h3 text-fg-primary">Withdrawal tracker</h2>
          {!inForce.length && <p className="type-body-md text-fg-tertiary">No pen is in a withdrawal period. Eggs and birds from every pen can be sold.</p>}
          {inForce.map((w) => {
            const day = Math.min(w.days, w.dayOf)
            return (
              <div key={w.penId} className="flex flex-col border-b border-line pb-3 last:border-b-0">
                <div className="flex items-start gap-2 pt-1">
                  <div className="flex flex-1 flex-col">
                    <span className="type-label-md text-fg-primary">
                      Pen {w.penId} · {w.medication}
                    </span>
                    <span className="type-body-sm text-fg-tertiary">
                      Last dose {weekdayDayMonth(w.lastDose)} · {w.days}-day withdrawal
                    </span>
                  </div>
                  <Badge dot tone="info">
                    Day {day} of {w.days}
                  </Badge>
                </div>
                <div className="my-3 h-1.5 rounded-full bg-subtle">
                  <div className="h-1.5 rounded-full bg-icon-info" style={{ width: `${(day / w.days) * 100}%` }} />
                </div>
                <KeyValueRow label="Clear to sell from" strong calculated={explain.withdrawal()}>
                  {weekdayDayMonth(w.clearFrom)}
                </KeyValueRow>
              </div>
            )
          })}
          <p className="pt-2 type-body-sm text-fg-secondary">Withdrawal days come from each medication’s settings (BRD §7.3) and the last dose in the pen’s entries.</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Movements" meta={<span className="type-body-sm text-fg-tertiary">Newest first · used first-expiry-first-out</span>} action={{ label: 'Export', onClick: exportRows }} />
        <Table columns={columns} rows={rows} rowKey={(r) => String(r.id)} />
        {!rows.length && <p className="px-5 py-4 type-body-md text-fg-tertiary">No movements in this range.</p>}
      </Card>
    </>
  )
}
