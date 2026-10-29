'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { dayMonth, daysFrom, kpi, nairaKpi, num, todayISO } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { isAttendant } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { formatNaira, formatNumber } from '../../lib/format'
import { InventoryTabs, LedgerNote } from './InventoryTabs'

// Birds bought but not yet placed in a pen. A bird purchase lands here; Pens → Place flock (or
// Add birds) draws from it, which is how each flock's bird cost is known.

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

type BatchRow = {
  id: number
  ref: string
  supplier: string
  type: string
  breed: string | null
  ageDays: number
  received: number
  placed: number
  inStock: number
  costPerBird: number | null
  receivedOn: string | null
  /** Where the birds went: "L-2604 · 1,000". */
  went: string
}

/** "Day-old" or "16 wk" */
const ageLabel = (days: number) => (days <= 0 ? 'Day-old' : days % 7 === 0 ? `${days / 7} wk` : `${days} days`)

export default function BirdStock() {
  const router = useRouter()
  const user = useCurrentUser()
  const { catalog, history } = useTrade()
  const today = todayISO()

  const rows: BatchRow[] = catalog.birdStock.map((b) => {
    const went = history.placements
      .filter((p) => p.purchase_id === b.purchase_id)
      .map((p) => `${history.flocks.find((f) => f.id === p.flock_id)?.code ?? 'Flock'} · ${formatNumber(p.birds)}`)
      .join(', ')
    return {
      id: b.purchase_id ?? 0,
      ref: b.ref ?? '—',
      supplier: b.supplier ?? '—',
      type: b.bird_type ?? '—',
      breed: b.breed,
      ageDays: b.bird_age_days ?? 0,
      received: b.received ?? 0,
      placed: b.placed ?? 0,
      inStock: b.in_stock ?? 0,
      costPerBird: b.cost_per_bird === null ? null : Number(b.cost_per_bird),
      receivedOn: b.received_on,
      went,
    }
  })
  // Batches with birds left first, oldest first: those should be placed next.
  rows.sort((a, b) => Number(b.inStock > 0) - Number(a.inStock > 0) || (a.receivedOn ?? '').localeCompare(b.receivedOn ?? ''))

  const waiting = rows.filter((r) => r.inStock > 0)
  const inStock = waiting.reduce((n, r) => n + r.inStock, 0)
  const value = waiting.reduce((n, r) => n + r.inStock * (r.costPerBird ?? 0), 0)
  const oldest = waiting.filter((r) => r.receivedOn).sort((a, b) => a.receivedOn!.localeCompare(b.receivedOn!))[0]
  const oldestDays = oldest ? daysFrom(oldest.receivedOn!, today) : null
  const kpis = [
    kpi({
      label: 'Birds in stock',
      value: num(inStock),
      unit: 'birds',
      current: null,
      previous: null,
      context: `${num(waiting.length)} ${waiting.length === 1 ? 'batch' : 'batches'} waiting`,
      info: 'Birds received on bird purchases − birds placed in pens from them (Place flock and Add birds). Birds sent back at delivery aren’t counted.',
      spark: FLAT,
    }),
    kpi({
      label: 'Value of stock',
      ...nairaKpi(value),
      current: null,
      previous: null,
      context: 'At purchase cost',
      info: 'For each batch: birds in stock × cost a bird (the purchase total ÷ birds received). Added up over batches.',
      spark: FLAT,
    }),
    kpi({
      label: 'Oldest batch waiting',
      value: oldestDays === null ? '—' : num(oldestDays),
      unit: oldestDays === null ? '' : 'days',
      current: null,
      previous: null,
      context: oldest ? `${oldest.ref} · received ${dayMonth(oldest.receivedOn!)}` : 'Nothing waiting',
      info: 'Days since the oldest batch with birds still in stock was received. Birds waiting long should be placed or checked.',
      spark: FLAT,
    }),
  ]

  const columns: Column<BatchRow>[] = [
    { key: 'ref', header: 'Purchase', width: 96, render: (r) => <TextCell tone="primary" mono>{r.ref}</TextCell> },
    {
      key: 'birds',
      header: 'Birds',
      render: (r) => <PrimaryCell initials={r.type.slice(0, 2).toUpperCase()} title={[r.type, r.breed].filter(Boolean).join(' · ')} subtitle={r.went ? `Placed: ${r.went}` : `From ${r.supplier}`} />,
    },
    { key: 'age', header: 'Age on arrival', width: 120, render: (r) => <TextCell>{ageLabel(r.ageDays)}</TextCell> },
    { key: 'received', header: 'Received', align: 'right', width: 96, render: (r) => <NumberCell>{formatNumber(r.received)}</NumberCell> },
    { key: 'placed', header: 'Placed', align: 'right', width: 88, render: (r) => <NumberCell>{formatNumber(r.placed)}</NumberCell> },
    {
      key: 'stock',
      header: 'In stock',
      align: 'right',
      width: 96,
      render: (r) => (r.inStock > 0 ? <NumberCell>{formatNumber(r.inStock)}</NumberCell> : <NumberCell tone="muted">0</NumberCell>),
    },
    { key: 'cost', header: 'Cost a bird', align: 'right', width: 112, render: (r) => <NumberCell>{r.costPerBird === null ? '—' : formatNaira(r.costPerBird)}</NumberCell> },
    { key: 'date', header: 'Received on', width: 112, render: (r) => <TextCell>{r.receivedOn ? dayMonth(r.receivedOn) : '—'}</TextCell> },
  ]

  const exportRows = () =>
    downloadCsv(
      'bird-stock',
      ['Purchase', 'Supplier', 'Bird type', 'Breed', 'Age on arrival (days)', 'Received', 'Placed', 'In stock', 'Cost a bird', 'Received on', 'Placed in'],
      rows.map((r) => [r.ref, r.supplier, r.type, r.breed, r.ageDays, r.received, r.placed, r.inStock, r.costPerBird, r.receivedOn, r.went]),
    )

  return (
    <>
      <PageHeader
        eyebrow={['Operate', 'Inventory']}
        title="Bird stock"
        description="Birds bought and not yet placed in a pen. Placing a flock draws from here, so each flock knows what its birds cost."
        actions={
          isAttendant(user.role) ? undefined : (
            <Button variant="primary" leadingIcon={Plus} onClick={() => router.push('/purchases/birds')}>
              Record bird purchase
            </Button>
          )
        }
      />
      <InventoryTabs />

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      <Card>
        <CardHeader
          title="Batches"
          meta={<span className="type-body-sm text-fg-tertiary">One row per bird purchase · {num(rows.length)} rows</span>}
          action={rows.length ? { label: 'Export', onClick: exportRows } : undefined}
        />
        {rows.length ? (
          <Table columns={columns} rows={rows} rowKey={(r) => String(r.id)} />
        ) : (
          <p className="px-5 pb-5 type-body-md text-fg-tertiary">
            No birds in stock. Record a bird purchase (Purchases → Birds) and the birds appear here until they’re placed in a pen with Pens → Place flock.
          </p>
        )}
        <LedgerNote>In stock = received − sent back − placed in pens. Flocks placed before bird stock existed are recorded as “not from a purchase”.</LedgerNote>
      </Card>
    </>
  )
}
