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
import { explainMoney } from '../data/explainMoney'
import { useTrade } from '../data/tradeContext'
import { ReceiveDeliveryDrawer } from '../features/stock/ReceiveDeliveryDrawer'
import { inRange, kpi, num, roleWithName } from '../data/metrics'
import { FLAT, monthSpans, weekSpans, weeksBack } from '../data/moneyKpis'
import { formatNumber } from '../lib/format'
import { Presence } from '../components/ui/Overlay'

const TABS = ['All', 'Feed', 'Medication'] as const

type Row = (Delivery & { pending?: false }) | (Order & { pending: true })

/** ST-D52 · what's been ordered and what's arrived. Prices and payments stay with the owner and accounts. */
export default function Deliveries() {
  const { orders, deliveries, suppliers, history, catalog } = useTrade()
  const [tab, setTab] = useState<(typeof TABS)[number]>('All')
  const [receiving, setReceiving] = useState(false)
  const match = (k: string) => tab === 'All' || k === tab.toLowerCase()
  const rows: Row[] = [...orders.map((o) => ({ ...o, pending: true as const })), ...deliveries].filter((r) => match(r.kind))
  // Received stock purchases (feed and medication) with the day they arrived.
  const received = history.purchases.filter((p) => p.received_on && p.kind !== 'birds')
  const receivedIn = (r: { from: string; to: string }) => received.filter((p) => inRange(p.received_on!, r))
  const week = weekSpans()
  const month = monthSpans()
  const feedIn = (r: { from: string; to: string }) => receivedIn(r).filter((p) => p.kind === 'feed').reduce((n, p) => n + Number(p.received_quantity ?? p.quantity), 0)
  const sentBack = receivedIn(month.now).reduce((n, p) => n + Number(p.returned_quantity), 0)
  const receivers = [...new Set(receivedIn(week.now).map((p) => catalog.profiles.find((x) => x.id === p.received_by)?.full_name.split(' ')[0]).filter(Boolean))]
  const accounts = [roleWithName(catalog, 'owner', 'the owner'), roleWithName(catalog, 'sales_accounts', 'accounts')].join(' and ')

  const kpis: Kpi[] = [
    kpi({ label: 'Received this week', value: String(receivedIn(week.now).length), unit: 'deliveries', current: receivedIn(week.now).length, previous: receivedIn(week.before).length, goodWhen: 'neither', context: receivers.length ? `by ${receivers.join(', ')}` : 'none yet this week', info: explainMoney.deliveriesWeek(), spark: weeksBack().map((w) => receivedIn(w).length) }),
    kpi({ label: 'Due now', value: String(orders.length), unit: orders.length === 1 ? 'delivery' : 'deliveries', current: null, previous: null, goodWhen: 'neither', context: orders.length ? orders.map((o) => o.ref).slice(0, 3).join(', ') : 'nothing on order', info: explainMoney.dueNow(), spark: FLAT }),
    kpi({ label: 'Sent back', value: num(sentBack), unit: 'items', current: null, previous: null, goodWhen: 'neither', context: `${month.now.label} so far`, info: explainMoney.sentBack(), spark: FLAT }),
    kpi({ label: 'Feed received', value: num(feedIn(month.now)), unit: 'bags', current: feedIn(month.now), previous: feedIn(month.before), goodWhen: 'neither', context: `${month.now.label} vs same days last month`, info: explainMoney.feedReceived(), spark: weeksBack().map(feedIn) }),
  ]

  const columns: Column<Row>[] = [
    { key: 'ref', header: 'Ref', width: 88, render: (r) => <TextCell tone="primary" mono>{r.ref}</TextCell> },
    { key: 'ordered', header: 'Ordered', width: 80, render: (r) => <TextCell>{r.ordered}</TextCell> },
    {
      key: 'supplier',
      header: 'Supplier',
      width: 200,
      render: (r) => {
        const s = suppliers.find((x) => x.id === r.supplierId)!
        return <PrimaryCell initials={s.initials} title={s.name} subtitle={s.kind} />
      },
    },
    { key: 'item', header: 'Item', render: (r) => <TextCell>{r.item}</TextCell> },
    { key: 'qty', header: 'Qty', align: 'right', width: 140, render: (r) => <NumberCell>{formatNumber(r.qty)} {r.unit}</NumberCell> },
    { key: 'received', header: 'Received', align: 'right', width: 110, render: (r) => (r.pending ? <NumberCell tone="muted">—</NumberCell> : <NumberCell>{r.received}</NumberCell>) },
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
        description={`What has been ordered and what has arrived. Prices and payments stay with ${accounts}.`}
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
