'use client'

import { Plus, Scale } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { NEAR_REORDER_FACTOR, medications } from '../../data/inventory'
import { useToast } from '../../components/ui/toastContext'
import { farmSettings } from '../../data/farmSettings'
import { dayMonth, daysFrom, kpi, monthName, nairaKpi, num, period, previous, todayISO, weekdayDayMonth, withdrawals } from '../../data/metrics'
import { people } from '../../data/stockMetrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { MedicationDrawer } from '../../features/stock/MedicationDrawer'
import { ReceiveDeliveryDrawer } from '../../features/stock/ReceiveDeliveryDrawer'
import { isAttendant } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { formatNumber } from '../../lib/format'
import { InventoryTabs } from './InventoryTabs'
import { Presence } from '../../components/ui/Overlay'

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

/** One batch of one medication. Opening stock (entered at go-live) has no batch number. */
type BatchRow = {
  key: string
  name: string
  category: string
  batch: string
  expiry: string | null
  stock: number
  /** The medication's total, for the reorder check. */
  total: number
  reorderAt: number
  unit: string
  withdrawalDays: number | null
  inUseBy: number[]
}

const qty = (n: number, unit: string) => `${formatNumber(n)} ${unit}`

function status(r: BatchRow, today: string): { tone: Tone; label: string } {
  if (r.expiry && r.expiry < today) return { tone: 'danger', label: 'Expired' }
  if (r.expiry && daysFrom(today, r.expiry) <= farmSettings.expiryWarningDays) return { tone: 'warning', label: `Expires ${dayMonth(r.expiry)}` }
  if (r.inUseBy.length) return { tone: 'info', label: `In use · Pen ${r.inUseBy.join(', ')}` }
  if (r.total <= r.reorderAt) return { tone: 'warning', label: 'Reorder' }
  if (r.total <= r.reorderAt * NEAR_REORDER_FACTOR) return { tone: 'neutral', label: 'Near reorder' }
  return { tone: 'success', label: 'OK' }
}

export default function MedicationStock() {
  const router = useRouter()
  const toast = useToast()
  const user = useCurrentUser()
  const { stockOf, history, catalog } = useTrade()
  const keeper = user.role === 'store-keeper'
  // Pen attendants can look, not act (BRD §4: Inventory V).
  const readOnly = isAttendant(user.role)
  const [showWithdrawal, setShowWithdrawal] = useState(true)
  const [overlay, setOverlay] = useState<{ kind: 'receive' } | { kind: 'detail'; name: string } | null>(null)
  const today = todayISO()
  const inForce = withdrawals(history, catalog, today)
  const unitOf = (u: string) => (u === 'vial' ? 'vials' : u)

  const rows: BatchRow[] = catalog.medications
    .filter((m) => m.is_active)
    .flatMap((m) => {
      const total = stockOf(m.name)
      const batches = catalog.batches.filter((b) => b.medicationId === m.id && b.onHand > 0)
      const opening = total - batches.reduce((n, b) => n + b.onHand, 0)
      const base = {
        name: m.name,
        category: m.category.charAt(0).toUpperCase() + m.category.slice(1),
        total,
        reorderAt: Number(m.reorder_level),
        unit: unitOf(m.stock_unit),
        withdrawalDays: m.withdrawal_days,
        inUseBy: inForce.filter((w) => w.medication === m.name).map((w) => w.penId),
      }
      const list: BatchRow[] = batches.map((b) => ({ ...base, key: `${m.id}-${b.purchaseId}`, batch: b.batchNo ?? '—', expiry: b.expiry, stock: b.onHand }))
      if (opening > 0 || !list.length) list.push({ ...base, key: `${m.id}-opening`, batch: opening > 0 ? 'Opening stock' : '—', expiry: null, stock: Math.max(0, opening) })
      return list
    })

  const month = period('month', today)
  const lastMonth = previous(month)
  const spent = (r: { from: string; to: string }) =>
    history.purchases.filter((p) => p.kind === 'medication' && p.purchased_on >= r.from && p.purchased_on <= r.to).reduce((n, p) => n + Number(p.total ?? p.quantity * p.unit_price), 0)
  const expiring = rows.filter((r) => r.expiry && daysFrom(today, r.expiry) <= farmSettings.expiryWarningDays)
  const nextExpiry = rows.filter((r) => r.expiry && r.expiry >= today).sort((a, b) => a.expiry!.localeCompare(b.expiry!))[0]
  const inStock = catalog.medications.filter((m) => m.is_active && stockOf(m.name) > 0)
  const toReorder = catalog.medications.filter((m) => m.is_active && stockOf(m.name) <= Number(m.reorder_level))
  const spentNow = spent(month)
  const kpis = [
    kpi({ label: 'Medications', value: String(inStock.length), unit: 'in stock', current: null, previous: null, goodWhen: 'neither', context: toReorder.length ? `${toReorder.length} at or below reorder` : 'none at reorder level', info: 'Medications with stock on hand above zero (opening stock + batches received − doses given ± counts).', spark: FLAT }),
    kpi({ label: `Expiring in ${farmSettings.expiryWarningDays} days`, value: String(expiring.length), unit: 'batches', current: null, previous: null, goodWhen: 'neither', context: nextExpiry ? `next on ${dayMonth(nextExpiry.expiry!)} ${nextExpiry.expiry!.slice(0, 4)}` : 'no batch dates', info: `Batches with stock left whose expiry date is within ${farmSettings.expiryWarningDays} days (set in Settings).`, spark: FLAT }),
    kpi({ label: 'Withdrawals in force', value: String(inForce.length), unit: inForce.length === 1 ? 'pen' : 'pens', current: null, previous: null, goodWhen: 'neither', context: inForce.length ? inForce.map((w) => `Pen ${w.penId} to ${dayMonth(w.clearFrom)}`).join(' · ') : 'all pens clear', info: 'Pens where the last dose + the medication’s withdrawal days hasn’t passed yet, so eggs and birds can’t be sold.', spark: FLAT }),
    kpi({ label: 'Spent this month', ...nairaKpi(spentNow), current: spentNow, previous: spent(lastMonth), goodWhen: 'down', context: `vs ${monthName(lastMonth.from)}`, info: 'Total of medication purchases dated this month, compared with the same days last month.', spark: FLAT }),
  ]

  const columns: Column<BatchRow>[] = [
    { key: 'name', header: 'Medication', render: (m) => <TextCell tone="primary">{m.name}</TextCell> },
    { key: 'category', header: 'Category', width: 110, render: (m) => <TextCell>{m.category}</TextCell> },
    { key: 'batch', header: 'Batch', width: 120, render: (m) => <TextCell mono>{m.batch}</TextCell> },
    { key: 'expiry', header: 'Expiry', width: 100, render: (m) => <TextCell>{m.expiry ? `${m.expiry.slice(8, 10)}/${m.expiry.slice(5, 7)}/${m.expiry.slice(0, 4)}` : '—'}</TextCell> },
    { key: 'stock', header: 'In stock', align: 'right', width: 110, render: (m) => <NumberCell>{qty(m.stock, m.unit)}</NumberCell> },
    { key: 'reorder', header: 'Reorder at', align: 'right', width: 100, render: (m) => <NumberCell>{qty(m.reorderAt, m.unit)}</NumberCell> },
    {
      key: 'withdrawal',
      header: 'Withdrawal',
      align: 'right',
      width: 100,
      render: (m) => (m.withdrawalDays === null ? <NumberCell tone="muted">—</NumberCell> : <NumberCell>{m.withdrawalDays} days</NumberCell>),
    },
    {
      key: 'status',
      header: 'Status',
      width: 150,
      render: (m) => {
        const s = status(m, today)
        return (
          <Badge dot tone={s.tone}>
            {s.label}
          </Badge>
        )
      },
    },
  ]

  const open = overlay?.kind === 'detail' ? medications.find((m) => m.name === overlay.name) : undefined
  const exportRows = () =>
    downloadCsv(
      'medication-stock',
      ['Medication', 'Category', 'Batch', 'Expiry', 'In stock', 'Unit', 'Reorder at', 'Withdrawal days', 'Status'],
      rows.map((r) => [r.name, r.category, r.batch, r.expiry, r.stock, r.unit, r.reorderAt, r.withdrawalDays, status(r, today).label]),
    )
  const { keeper: keeperName } = people(catalog)

  return (
    <>
      <PageHeader
        eyebrow={keeper ? ['Inventory', 'Medication'] : ['Operate', 'Inventory']}
        title="Medication stock"
        description="Batches are used first-expiry-first-out. Withdrawal periods follow every pen that was treated."
        actions={
          readOnly ? undefined : (
            <>
              <Button leadingIcon={Scale} onClick={() => (keeper ? router.push('/inventory/count') : toast(`${keeperName.charAt(0).toUpperCase() + keeperName.slice(1)} runs the stock count`))}>
                Stock count
              </Button>
              {keeper ? (
                <Button variant="primary" leadingIcon={Plus} onClick={() => setOverlay({ kind: 'receive' })}>
                  Receive delivery
                </Button>
              ) : (
                <Button variant="primary" leadingIcon={Plus} onClick={() => router.push('/purchases')}>
                  Record purchase
                </Button>
              )}
            </>
          )
        }
      />
      <InventoryTabs />

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      {showWithdrawal &&
        inForce.map((w) => (
          <Alert
            key={w.penId}
            title={`Pen ${w.penId} — no egg or bird sales until ${weekdayDayMonth(w.clearFrom)}`}
            action={<AlertAction onClick={() => router.push(`/pens/${w.penId}`)}>View Pen {w.penId}</AlertAction>}
            onDismiss={() => setShowWithdrawal(false)}
          >
            {w.medication} last given {dayMonth(w.lastDose)} with a {w.days}-day withdrawal. Eggs from Pen {w.penId} are kept apart until then.
          </Alert>
        ))}

      <Card>
        <CardHeader
          title="Batches"
          meta={<span className="type-body-sm text-fg-tertiary">Oldest expiry is used first · {num(rows.length)} rows</span>}
          action={{ label: 'Export', onClick: exportRows }}
        />
        <Table columns={columns} rows={rows} rowKey={(m) => m.key} onRowClick={(m) => setOverlay({ kind: 'detail', name: m.name })} />
      </Card>

      <Presence>{overlay?.kind === 'receive' && <ReceiveDeliveryDrawer onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{open && <MedicationDrawer medication={open} onClose={() => setOverlay(null)} />}</Presence>
    </>
  )
}
