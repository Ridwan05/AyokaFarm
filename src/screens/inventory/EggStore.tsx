'use client'

import { Plus, Scale } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '../../data/sessionContext'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { eggDelta, eggKpis, eggStore, withBalances, withdrawal, type Balanced, type EggMovement } from '../../data/inventory'
import { InventoryTabs } from './InventoryTabs'

const columns: Column<Balanced<EggMovement>>[] = [
  { key: 'date', header: 'Date', width: 130, render: (r) => <TextCell>{r.date}</TextCell> },
  { key: 'opening', header: 'Opening', align: 'right', width: 110, render: (r) => <NumberCell>{r.opening}</NumberCell> },
  { key: 'collected', header: 'Collected', align: 'right', width: 110, render: (r) => <NumberCell>+{r.collected}</NumberCell> },
  { key: 'sold', header: 'Sold', align: 'right', width: 110, render: (r) => <NumberCell>−{r.sold}</NumberCell> },
  { key: 'broken', header: 'Broken', align: 'right', width: 110, render: (r) => <NumberCell>−{r.broken}</NumberCell> },
  {
    key: 'held',
    header: `Held · Pen ${withdrawal.pen}`,
    align: 'right',
    width: 110,
    render: (r) => (r.held === null ? <NumberCell tone="muted">—</NumberCell> : <NumberCell>+{r.held}</NumberCell>),
  },
  { key: 'closing', header: 'Closing', align: 'right', width: 150, render: (r) => <NumberCell>{r.closing}</NumberCell> },
  { key: 'source', header: 'Source', render: (r) => <TextCell tone="primary">{r.source}</TextCell> },
]

export default function EggStore() {
  const [showHeld, setShowHeld] = useState(true)
  const router = useRouter()
  const role = useCurrentUser().role
  const keeper = role === 'store-keeper'
  // Pen attendants can look, not act (BRD §4: Inventory V).
  const readOnly = role === 'pen-attendant'
  return (
    <>
      <PageHeader
        eyebrow={keeper ? ['Inventory', 'Eggs'] : ['Operate', 'Inventory']}
        title="Egg store"
        description={keeper ? 'Read only for the store — eggs come in from pen entries and go out through sales.' : 'Eggs come in from pen entries and go out through sales — counted, never typed.'}
        actions={
          readOnly ? undefined : (
          keeper ? (
            <Button leadingIcon={Scale} onClick={() => router.push('/inventory/count')}>
              Stock count
            </Button>
          ) : (
          <>
            <Button leadingIcon={Scale}>Stock count</Button>
            <Button variant="primary" leadingIcon={Plus}>
              Write off eggs
            </Button>
          </>
          )
          )
        }
      />
      <InventoryTabs />

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {eggKpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {showHeld && (
        <Alert title={`Pen ${withdrawal.pen}’s eggs are held until ${withdrawal.until}`} onDismiss={() => setShowHeld(false)}>
          {withdrawal.medication} withdrawal. {withdrawal.heldCrates} crates are kept apart in marked crates and can’t be sold. On 12
          Oct they’re written off with a reason, and the pen’s eggs count again from that day.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Egg store ledger"
          meta={<span className="type-body-sm text-fg-tertiary">Crates of 30 · closing = opening + collected − sold − broken</span>}
          action={{ label: 'Export', to: '#' }}
        />
        <Table columns={columns} rows={withBalances(eggStore.closing, eggStore.ledger, eggDelta)} rowKey={(r) => r.date} />
      </Card>
    </>
  )
}
