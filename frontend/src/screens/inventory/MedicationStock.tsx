'use client'

import { Plus, Scale } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { medicationKpis, medications, medicationStatus, withdrawal, type Medication } from '../../data/inventory'
import { useToast } from '../../components/ui/toastContext'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { MedicationDrawer } from '../../features/stock/MedicationDrawer'
import { ReceiveDeliveryDrawer } from '../../features/stock/ReceiveDeliveryDrawer'
import { isAttendant } from '../../lib/access'
import { formatNumber } from '../../lib/format'
import { InventoryTabs } from './InventoryTabs'
import { Presence } from '../../components/ui/Overlay'

const qty = (n: number, unit: Medication['unit']) => `${formatNumber(n)} ${unit}`

const columns: Column<Medication>[] = [
  { key: 'name', header: 'Medication', render: (m) => <TextCell tone="primary">{m.name}</TextCell> },
  { key: 'category', header: 'Category', width: 130, render: (m) => <TextCell>{m.category}</TextCell> },
  { key: 'batch', header: 'Batch', width: 110, render: (m) => <TextCell mono>{m.batch}</TextCell> },
  { key: 'expiry', header: 'Expiry', width: 110, render: (m) => <TextCell>{m.expiry}</TextCell> },
  { key: 'stock', header: 'In stock', align: 'right', width: 110, render: (m) => <NumberCell>{qty(m.stock, m.unit)}</NumberCell> },
  { key: 'reorder', header: 'Reorder at', align: 'right', width: 110, render: (m) => <NumberCell>{qty(m.reorderAt, m.unit)}</NumberCell> },
  {
    key: 'withdrawal',
    header: 'Withdrawal',
    align: 'right',
    width: 110,
    render: (m) => (m.withdrawalDays === null ? <NumberCell tone="muted">—</NumberCell> : <NumberCell>{m.withdrawalDays} days</NumberCell>),
  },
  {
    key: 'status',
    header: 'Status',
    width: 150,
    render: (m) => {
      const s = medicationStatus(m)
      return (
        <Badge dot tone={s.tone}>
          {s.label}
        </Badge>
      )
    },
  },
]

export default function MedicationStock() {
  const router = useRouter()
  const toast = useToast()
  const user = useCurrentUser()
  const { stockOf } = useTrade()
  const keeper = user.role === 'store-keeper'
  // Pen attendants can look, not act (BRD §4: Inventory V).
  const readOnly = isAttendant(user.role)
  const [showWithdrawal, setShowWithdrawal] = useState(true)
  const [overlay, setOverlay] = useState<{ kind: 'receive' } | { kind: 'detail'; batch: string } | null>(null)
  const rows = medications.map((m) => ({ ...m, stock: stockOf(m.name, m.stock) }))
  const open = overlay?.kind === 'detail' ? medications.find((m) => m.batch === overlay.batch) : undefined
  return (
    <>
      <PageHeader
        eyebrow={keeper ? ['Inventory', 'Medication'] : ['Operate', 'Inventory']}
        title="Medication stock"
        description="Batches are used first-expiry-first-out. Withdrawal periods follow every pen that was treated."
        actions={
          readOnly ? undefined : (
          <>
            <Button leadingIcon={Scale} onClick={() => (keeper ? router.push('/inventory/count') : toast('Bayo runs the weekly count on Fridays'))}>
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
        {medicationKpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {showWithdrawal && (
        <Alert
          title={`Pen ${withdrawal.pen} — no egg or bird sales until ${withdrawal.until}`}
          action={<AlertAction onClick={() => router.push(`/pens/${withdrawal.pen}`)}>View Pen {withdrawal.pen}</AlertAction>}
          onDismiss={() => setShowWithdrawal(false)}
        >
          {withdrawal.medication} given {withdrawal.given} with a {withdrawal.days}-day withdrawal. Any sale from Pen {withdrawal.pen}{' '}
          shows a warning until then, and its eggs are kept in marked crates.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Batches"
          meta={<span className="type-body-sm text-fg-tertiary">Oldest expiry is used first</span>}
          action={{ label: 'Export', to: '#' }}
        />
        <Table columns={columns} rows={rows} rowKey={(m) => m.batch} onRowClick={(m) => setOverlay({ kind: 'detail', batch: m.batch })} />
      </Card>

      <Presence>{overlay?.kind === 'receive' && <ReceiveDeliveryDrawer onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{open && <MedicationDrawer medication={open} onClose={() => setOverlay(null)} />}</Presence>
    </>
  )
}
