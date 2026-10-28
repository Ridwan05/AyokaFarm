'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { KpiCard, type Kpi } from '../components/ui/KpiCard'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../components/ui/Table'
import { Tabs } from '../components/ui/Tabs'
import type { Delivery, Order } from '../data/deliveries'
import { useTrade } from '../data/tradeContext'
import { ReceiveDeliveryDrawer } from '../features/stock/ReceiveDeliveryDrawer'
import { formatNumber } from '../lib/format'
import { Presence } from '../components/ui/Overlay'

const TABS = ['All', 'Feed', 'Medication'] as const
const flat = [1, 1, 1, 1, 1, 1, 1]

type Row = (Delivery & { pending?: false }) | (Order & { pending: true })

/** ST-D52 · what's been ordered and what's arrived. Prices and payments stay with Adeola and Funmi. */
export default function Deliveries() {
  const { orders, deliveries, suppliers } = useTrade()
  const [tab, setTab] = useState<(typeof TABS)[number]>('All')
  const [receiving, setReceiving] = useState(false)
  const match = (k: string) => tab === 'All' || k === tab.toLowerCase()
  const rows: Row[] = [...orders.map((o) => ({ ...o, pending: true as const })), ...deliveries].filter((r) => match(r.kind))
  const thisWeek = deliveries.filter((d) => Number(d.received.slice(0, 2)) >= 3 && d.received.slice(3, 5) === '10')
  const feedBags = deliveries.filter((d) => d.kind === 'feed' && d.received.slice(3, 5) === '10').reduce((n, d) => n + d.qty - d.sentBack, 0)
  const sentBack = deliveries.reduce((n, d) => n + d.sentBack, 0)

  const kpis: Kpi[] = [
    { label: 'Received this week', value: String(thisWeek.length), unit: 'deliveries', delta: 'All checked', trend: 'flat', sentiment: 'neutral', context: 'by Bayo', info: 'Deliveries received since Saturday', spark: flat },
    { label: 'Due now', value: String(orders.length), unit: 'deliveries', delta: orders.length ? 'Ordered' : 'Nothing late', trend: 'flat', sentiment: 'neutral', context: orders.length ? orders.map((o) => o.ref).join(', ') : 'next: none booked', info: 'Orders placed but not yet received', spark: flat },
    { label: 'Sent back', value: String(sentBack), unit: 'items', delta: 'This month', trend: 'flat', sentiment: 'neutral', context: 'torn or wet', info: 'Damaged items the driver took back', spark: flat },
    { label: 'Feed received', value: String(feedBags), unit: 'bags', delta: 'Oct so far', trend: 'up', sentiment: 'bad', context: 'into the store', info: 'Bags of feed received in October', spark: [0.08, 0.07, 0.08, 0.08, 0.07, 0.08, 0.12, 0.17] },
  ]

  const columns: Column<Row>[] = [
    { key: 'ref', header: 'Ref', width: 88, render: (r) => <TextCell tone="primary" mono>{r.ref}</TextCell> },
    { key: 'ordered', header: 'Ordered', width: 80, render: (r) => <TextCell>{r.ordered}</TextCell> },
    {
      key: 'supplier',
      header: 'Supplier',
      width: 300,
      render: (r) => {
        const s = suppliers.find((x) => x.id === r.supplierId)!
        return <PrimaryCell initials={s.initials} title={s.name} subtitle={s.kind} />
      },
    },
    { key: 'item', header: 'Item', render: (r) => <TextCell>{r.item}</TextCell> },
    { key: 'qty', header: 'Qty', align: 'right', width: 110, render: (r) => <NumberCell>{formatNumber(r.qty)} {r.unit}</NumberCell> },
    { key: 'received', header: 'Received', align: 'right', width: 120, render: (r) => (r.pending ? <NumberCell tone="muted">—</NumberCell> : <NumberCell>{r.received}</NumberCell>) },
    { key: 'by', header: 'By', align: 'right', width: 70, render: (r) => <TextCell>{r.pending ? '—' : r.by}</TextCell> },
    {
      key: 'status',
      header: 'Status',
      width: 130,
      render: (r) =>
        r.pending ? (
          <Badge dot tone="warning">Due</Badge>
        ) : (
          <Badge dot tone={r.sentBack ? 'warning' : 'success'}>{r.sentBack ? `${r.sentBack} sent back` : 'Received'}</Badge>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={['Trade', 'Deliveries']}
        title="Deliveries"
        description="What has been ordered and what has arrived. Prices and payments stay with Adeola and Funmi."
        actions={
          <Button variant="primary" leadingIcon={Plus} onClick={() => setReceiving(true)} disabled={orders.length === 0}>
            Receive delivery
          </Button>
        }
      />
      <Tabs label="Delivery type" tabs={TABS} value={tab} onChange={setTab} />
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>
      <Card>
        <CardHeader title="Recent deliveries" meta={<span className="type-body-sm text-fg-tertiary">Feed and medication · birds go straight to the pens</span>} />
        <Table columns={columns} rows={rows} rowKey={(r) => r.ref} rowClassName={(r) => (r.pending ? 'bg-accent-subtle' : undefined)} />
      </Card>
      <Presence>{receiving && <ReceiveDeliveryDrawer onClose={() => setReceiving(false)} />}</Presence>
    </>
  )
}
