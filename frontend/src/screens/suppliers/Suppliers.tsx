'use client'

import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { RowMenu } from '../../components/ui/Menu'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { supplierKpis } from '../../data/supplierKpis'
import type { Supplier } from '../../data/suppliers'
import { useTrade } from '../../data/tradeContext'
import { PaymentModal } from '../../features/payments/PaymentModal'
import { AddSupplierModal } from '../../features/suppliers/AddSupplierModal'
import { formatNaira } from '../../lib/format'
import { Presence } from '../../components/ui/Overlay'

type Row = { s: Supplier; balance: number }

/** We owe first (biggest first), then suppliers holding credit, then paid up. */
const rank = (balance: number) => (balance > 0 ? 0 : balance < 0 ? 1 : 2)

const status = (balance: number) =>
  balance > 0 ? { tone: 'warning' as const, label: 'We owe' } : balance < 0 ? { tone: 'info' as const, label: 'Credit' } : { tone: 'success' as const, label: 'Paid up' }

export default function Suppliers() {
  const router = useRouter()
  const { suppliers, supplierBalance } = useTrade()
  const [overlay, setOverlay] = useState<{ kind: 'add' } | { kind: 'pay'; id: string } | null>(null)
  const rows: Row[] = suppliers.map((s) => ({ s, balance: supplierBalance(s.id) })).sort((a, b) => rank(a.balance) - rank(b.balance) || b.balance - a.balance)

  const columns: Column<Row>[] = [
    { key: 'supplier', header: 'Supplier', render: (r) => <PrimaryCell initials={r.s.initials} title={r.s.name} subtitle={r.s.kind} /> },
    { key: 'supplies', header: 'Supplies', width: 220, render: (r) => <TextCell>{r.s.supplies}</TextCell> },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      width: 130,
      render: (r) => (r.balance < 0 ? <NumberCell tone="success">Credit {formatNaira(-r.balance)}</NumberCell> : <NumberCell>{formatNaira(r.balance)}</NumberCell>),
    },
    { key: 'lastPurchase', header: 'Last purchase', width: 120, render: (r) => <TextCell>{r.s.lastPurchase}</TextCell> },
    { key: 'lastPayment', header: 'Last payment', width: 120, render: (r) => <TextCell>{r.s.lastPayment}</TextCell> },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      render: (r) => {
        const st = status(r.balance)
        return (
          <Badge dot tone={st.tone}>
            {st.label}
          </Badge>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={['People', 'Suppliers']}
        title="Suppliers"
        description={`${suppliers.length} suppliers. What we owe is calculated from purchases, supplier expenses and payments.`}
        actions={
          <>
            <Button leadingIcon={Download}>Export</Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setOverlay({ kind: 'add' })}>
              Add supplier
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {supplierKpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>
      <Card>
        <CardHeader title="All suppliers" meta={<span className="type-body-sm text-fg-tertiary">Sorted by what we owe</span>} />
        <Table
          columns={columns}
          rows={rows}
          rowKey={(r) => r.s.id}
          onRowClick={(r) => router.push(`/suppliers/${r.s.id}`)}
          actionsWidth={56}
          rowActions={(r) => (
            <RowMenu
              items={[
                { label: 'Open statement', onSelect: () => router.push(`/suppliers/${r.s.id}`) },
                { label: 'Pay supplier', onSelect: () => setOverlay({ kind: 'pay', id: r.s.id }), disabled: r.balance <= 0 },
                { label: 'New purchase', onSelect: () => router.push('/purchases') },
              ]}
            />
          )}
        />
      </Card>
      <p className="-mt-2 type-body-sm text-fg-secondary">
        Equipment bought from a supplier is recorded as an expense; any unpaid part adds to what we owe them (FR-SUP-3). Open a supplier for their statement.
      </p>

      <Presence>{overlay?.kind === 'add' && <AddSupplierModal onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{overlay?.kind === 'pay' && <PaymentModal direction="out" partyId={overlay.id} onClose={() => setOverlay(null)} />}</Presence>
    </>
  )
}
