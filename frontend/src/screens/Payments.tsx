'use client'

import { Banknote, CalendarDays, Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { SearchInput } from '../components/ui/Form'
import { KpiCard } from '../components/ui/KpiCard'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../components/ui/Table'
import { inRange, period as periodRange } from '../data/metrics'
import { paymentKpis } from '../data/moneyKpis'
import type { Payment } from '../data/payments'
import { useTrade } from '../data/tradeContext'
import { PaymentModal } from '../features/payments/PaymentModal'
import { dayMonth } from '../features/purchases/purchaseView'
import { downloadCsv } from '../lib/export'
import { formatNaira } from '../lib/format'
import { Presence } from '../components/ui/Overlay'
import { RowMenu } from '../components/ui/Menu'
import { EditPaymentModal } from '../features/payments/EditPaymentModal'
import { VoidModal } from '../features/records/VoidModal'
import { canEditRecord, canVoidRecord } from '../features/records/recordRules'
import { useCurrentUser } from '../data/sessionContext'

const DIRECTIONS = ['Received', 'Paid out'] as const
const PERIODS = ['This week', 'This month', 'All time'] as const
const METHODS = ['All methods', 'Cash', 'Transfer', 'POS'] as const
const methodLabel = { cash: 'Cash', transfer: 'Transfer', POS: 'POS' }

export default function Payments() {
  const trade = useTrade()
  const { payments, customers, suppliers } = trade
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>('Received')
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('This week')
  const [method, setMethod] = useState<(typeof METHODS)[number]>('All methods')
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState(false)
  const [acting, setActing] = useState<{ kind: 'edit' | 'void'; ref: string } | null>(null)
  const user = useCurrentUser()
  const rowOf = (p: Payment) => trade.history.payments.find((x) => x.ref === p.ref)

  const isIn = direction === 'Received'
  const actingPayment = acting ? payments.find((p) => p.ref === acting.ref) : undefined
  const party = (p: Payment) =>
    isIn ? customers.find((c) => c.id === p.partyId) : suppliers.find((s) => s.id === p.partyId)
  const q = query.trim().toLowerCase()
  const rows = payments
    .filter((p) => p.direction === (isIn ? 'in' : 'out'))
    .filter((p) => (period === 'This week' ? inRange(p.date, periodRange('week')) : period === 'This month' ? inRange(p.date, periodRange('month')) : true))
    .filter((p) => method === 'All methods' || methodLabel[p.method] === method)
    .filter((p) => !q || (party(p)?.name.toLowerCase().includes(q) ?? false) || (p.reference?.toLowerCase().includes(q) ?? false))

  const columns: Column<Payment>[] = [
    { key: 'ref', header: 'Ref', width: 84, render: (p) => <TextCell tone="primary" mono>{p.ref}</TextCell> },
    { key: 'date', header: 'Date', width: 80, render: (p) => <TextCell>{dayMonth(p.date)}</TextCell> },
    {
      key: 'party',
      header: isIn ? 'Customer' : 'Supplier',
      render: (p) => {
        const x = party(p)
        if (!x) return null
        const subtitle = 'buys' in x ? `Regular · ${x.buys}` : x.kind
        return <PrimaryCell initials={x.initials} title={x.name} subtitle={subtitle} />
      },
    },
    { key: 'method', header: 'Method', width: 96, render: (p) => <TextCell>{methodLabel[p.method]}</TextCell> },
    { key: 'reference', header: 'Reference', width: 110, render: (p) => <TextCell mono>{p.reference ?? '—'}</TextCell> },
    { key: 'amount', header: 'Amount', align: 'right', width: 120, render: (p) => <NumberCell>{formatNaira(p.amount)}</NumberCell> },
    { key: 'cleared', header: 'Cleared', width: 220, render: (p) => <TextCell>{p.cleared}</TextCell> },
    { key: 'by', header: 'By', width: 68, render: (p) => <TextCell>{p.by}</TextCell> },
  ]

  return (
    <>
      <PageHeader
        eyebrow={['Trade', 'Payments']}
        title="Payments"
        description="Money received or paid outside a sale or purchase, like settling an old debt. Each payment clears the oldest bills first."
        actions={
          <>
            <Button
              leadingIcon={Download}
              onClick={() =>
                downloadCsv(
                  isIn ? 'payments-received' : 'payments-made',
                  ['Ref', 'Date', isIn ? 'Customer' : 'Supplier', 'Method', 'Reference', 'Amount (₦)', 'Cleared', 'By'],
                  rows.map((p) => [p.ref, p.date, party(p)?.name ?? '', methodLabel[p.method], p.reference, p.amount, p.cleared, p.by]),
                )
              }
            >
              Export
            </Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setRecording(true)}>
              Record payment
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Direction" options={DIRECTIONS} value={direction} onChange={setDirection} />
        <Select label="Period" leadingIcon={CalendarDays} width={170} options={PERIODS} value={period} onChange={setPeriod} />
        <Select label="Method" leadingIcon={Banknote} width={180} options={METHODS} value={method} onChange={setMethod} />
        <span className="flex-1" />
        <SearchInput label="Search customer or reference" placeholder="Search customer or reference" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {paymentKpis(trade).map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <Card>
        <CardHeader
          title={`${direction} ${period.toLowerCase()}`}
          meta={<span className="type-body-sm text-fg-tertiary">{rows.length} payments</span>}
          action={{ label: 'All payments', onClick: () => setPeriod('All time') }}
        />
        <Table
          columns={columns}
          rows={rows}
          rowKey={(p) => p.ref}
          actionsWidth={56}
          rowActions={(p) => {
            const items = [
              ...(canEditRecord(user, 'payments', rowOf(p)) ? [{ label: 'Correct payment…', onSelect: () => setActing({ kind: 'edit', ref: p.ref }) }] : []),
              ...(canVoidRecord(user, 'payments') ? [{ label: 'Void payment…', danger: true, onSelect: () => setActing({ kind: 'void', ref: p.ref }) }] : []),
            ]
            return items.length ? <RowMenu items={items} /> : null
          }}
        />
        {rows.length === 0 && <p className="px-5 py-6 type-body-md text-fg-tertiary">No payments match these filters.</p>}
      </Card>

      <Presence>{recording && <PaymentModal direction={isIn ? 'in' : 'out'} onClose={() => setRecording(false)} />}</Presence>
      <Presence>
        {acting?.kind === 'edit' && actingPayment && (
          <EditPaymentModal payment={actingPayment} partyName={party(actingPayment)?.name ?? ''} onClose={() => setActing(null)} />
        )}
      </Presence>
      <Presence>
        {acting?.kind === 'void' && actingPayment && (
          <VoidModal
            kind="payments"
            refId={actingPayment.ref}
            label={`${party(actingPayment)?.name ?? ''} · ${formatNaira(actingPayment.amount)}`}
            onClose={() => setActing(null)}
          />
        )}
      </Presence>
    </>
  )
}
