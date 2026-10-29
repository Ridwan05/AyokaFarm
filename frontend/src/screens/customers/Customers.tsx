'use client'

import { Download, ListFilter, MessageCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { SearchInput } from '../../components/ui/Form'
import { KpiCard } from '../../components/ui/KpiCard'
import { RowMenu } from '../../components/ui/Menu'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import type { Customer } from '../../data/customers'
import { farmSettings } from '../../data/farmSettings'
import type { Aging, Bill } from '../../data/ledger'
import { agingOf, customerKpis } from '../../data/moneyKpis'
import { useTrade } from '../../data/tradeContext'
import { AddCustomerModal } from '../../features/customers/AddCustomerModal'
import { AgingBar } from '../../features/customers/AgingBar'
import { agingLegend, customerStatus, oldestDays } from '../../features/customers/customerView'
import { SendStatementsModal } from '../../features/customers/SendStatementsModal'
import { PaymentModal } from '../../features/payments/PaymentModal'
import { downloadCsv } from '../../lib/export'
import { formatNaira } from '../../lib/format'
import { Presence } from '../../components/ui/Overlay'

const SORTS = ['Biggest balance first', 'Oldest bill first', 'Name A–Z'] as const

type Row = { c: Customer; balance: number; bills: Bill[] }

export default function Customers() {
  const router = useRouter()
  const trade = useTrade()
  const { customers, customerBalance, customerOpenBills } = trade
  const OVERDUE_DAYS = farmSettings.overdueDebtDays
  const [sort, setSort] = useState<(typeof SORTS)[number]>(SORTS[0])
  const [query, setQuery] = useState('')
  const [overlay, setOverlay] = useState<{ kind: 'add' | 'send' } | { kind: 'pay'; id: string } | null>(null)

  const all: Row[] = customers.map((c) => ({ c, balance: customerBalance(c.id), bills: customerOpenBills(c.id) }))
  const owing = all.filter((r) => r.balance > 0)
  const overdue = owing.filter((r) => (oldestDays(r.bills) ?? 0) > OVERDUE_DAYS)
  const tabs = [`All · ${all.length}`, `Owing · ${owing.length}`, `Overdue · ${overdue.length}`, 'One-off buyers']
  const [tab, setTab] = useState(tabs[1])
  const tabKey = tab.split(' · ')[0]

  const totals = owing.reduce<Aging>(
    (t, r) => {
      const a = agingOf(r.bills)
      return { current: t.current + a.current, days31to60: t.days31to60 + a.days31to60, over60: t.over60 + a.over60 }
    },
    { current: 0, days31to60: 0, over60: 0 },
  )

  const q = query.trim().toLowerCase()
  const rows = (tabKey === 'All' ? all : tabKey === 'Owing' ? owing : tabKey === 'Overdue' ? overdue : [])
    .filter((r) => !q || r.c.name.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === 'Name A–Z' ? a.c.name.localeCompare(b.c.name) : sort === 'Oldest bill first' ? (oldestDays(b.bills) ?? -1) - (oldestDays(a.bills) ?? -1) : b.balance - a.balance,
    )

  const columns: Column<Row>[] = [
    { key: 'customer', header: 'Customer', render: (r) => <PrimaryCell initials={r.c.initials} title={r.c.name} subtitle={`Regular since ${r.c.since}`} /> },
    { key: 'buys', header: 'Buys', width: 130, render: (r) => <TextCell>{r.c.buys}</TextCell> },
    { key: 'balance', header: 'Balance', align: 'right', width: 110, render: (r) => <NumberCell>{formatNaira(r.balance)}</NumberCell> },
    {
      key: 'oldest',
      header: 'Oldest unpaid',
      align: 'right',
      width: 124,
      render: (r) => {
        const d = oldestDays(r.bills)
        return d === null ? <NumberCell tone="muted">—</NumberCell> : <NumberCell tone={d > OVERDUE_DAYS ? 'danger' : 'default'}>{d} day{d === 1 ? '' : 's'}</NumberCell>
      },
    },
    { key: 'last', header: 'Last sale', width: 96, render: (r) => <TextCell>{r.c.lastSale}</TextCell> },
    { key: 'wa', header: 'WhatsApp', width: 96, render: (r) => <TextCell>{r.c.whatsapp ? 'Opted in' : '—'}</TextCell> },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      render: (r) => {
        const s = customerStatus(r.bills)
        return (
          <Badge dot tone={s.tone}>
            {s.label}
          </Badge>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={['People', 'Customers']}
        title="Customers"
        description={`${customers.length} customers. Balances are calculated from every sale and payment, never typed.`}
        actions={
          <>
            <Button
              leadingIcon={Download}
              onClick={() =>
                downloadCsv(
                  'customers',
                  ['Customer', 'Buys', 'Area', 'Regular since', 'Balance (₦)', 'Oldest unpaid (days)', 'Last sale', 'WhatsApp', 'Status'],
                  rows.map((r) => [r.c.name, r.c.buys, r.c.area, r.c.since, r.balance, oldestDays(r.bills), r.c.lastSale, r.c.whatsapp ? 'Opted in' : 'No', customerStatus(r.bills).label]),
                )
              }
            >
              Export
            </Button>
            <Button leadingIcon={MessageCircle} onClick={() => setOverlay({ kind: 'send' })}>
              Send statements
            </Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setOverlay({ kind: 'add' })}>
              Add customer
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {customerKpis(trade).map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <Card className="flex-row flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <span className="type-label-md text-fg-primary">Aging</span>
        <AgingBar aging={totals} className="w-full shrink-0 lg:w-[424px]" />
        <span className="hidden flex-1 lg:block" />
        {agingLegend().map((l) => (
          <span key={l.key} className="flex items-center gap-1.5 type-body-sm text-fg-secondary">
            <span className={`size-2 rounded-full ${l.dot}`} />
            {l.label}
            <span className={l.key === 'over60' ? 'type-label-md text-fg-danger' : 'type-label-md text-fg-primary'}>{formatNaira(totals[l.key])}</span>
          </span>
        ))}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Customers" options={tabs} value={tabs.find((t) => t.startsWith(tabKey))!} onChange={setTab} />
        <span className="flex-1" />
        <SearchInput label="Search customers" placeholder="Search customers" width={240} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select label="Sort customers" leadingIcon={ListFilter} width={220} options={SORTS} value={sort} onChange={setSort} />
      </div>

      <Card>
        <CardHeader title={tabKey} meta={<span className="type-body-sm text-fg-tertiary">{sort === SORTS[0] ? 'Sorted by balance' : sort}</span>} />
        {tabKey === 'One-off buyers' ? (
          <p className="px-5 pb-6 type-body-md text-fg-tertiary">One-off buyers pay in full at the gate, so they don’t get a statement. Their sales are under Sales.</p>
        ) : (
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.c.id}
            onRowClick={(r) => router.push(`/customers/${r.c.id}`)}
            actionsWidth={56}
            rowActions={(r) => (
              <RowMenu
                items={[
                  { label: 'Open statement', onSelect: () => router.push(`/customers/${r.c.id}`) },
                  { label: 'Record a payment', onSelect: () => setOverlay({ kind: 'pay', id: r.c.id }), disabled: r.balance <= 0 },
                ]}
              />
            )}
          />
        )}
      </Card>

      <Presence>{overlay?.kind === 'add' && <AddCustomerModal onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{overlay?.kind === 'send' && <SendStatementsModal onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{overlay?.kind === 'pay' && <PaymentModal direction="in" partyId={overlay.id} onClose={() => setOverlay(null)} />}</Presence>
    </>
  )
}
