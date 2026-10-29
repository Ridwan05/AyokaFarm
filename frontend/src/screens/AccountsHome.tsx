'use client'

import { Banknote, ChevronRight, Clock, Plus, Receipt, Truck } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { KpiCard, type Kpi } from '../components/ui/KpiCard'
import { RowMenu } from '../components/ui/Menu'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../components/ui/Table'
import type { Customer } from '../data/customers'
import { daysBetween, type Bill } from '../data/ledger'
import { explainMoney } from '../data/explainMoney'
import { farmSettings } from '../data/farmSettings'
import { addDays, kpi, lastDays, nowHM, todayISO } from '../data/metrics'
import { FLAT, approvers, overdueToSuppliers, salesIn } from '../data/moneyKpis'
import { amountOf, products, saleStatus } from '../data/sales'
import { farm } from '../data/session'
import { useCurrentUser } from '../data/sessionContext'
import { useTrade } from '../data/tradeContext'
import { customerStatus } from '../features/customers/customerView'
import { PaymentModal } from '../features/payments/PaymentModal'
import { SaleOverlays, type SaleOverlay } from '../features/sales/SaleOverlays'
import { statusBadge } from '../features/sales/saleView'
import { dayMonth } from '../features/purchases/purchaseView'
import { formatLongDate, formatNaira, formatNumber, greeting } from '../lib/format'
import { Presence } from '../components/ui/Overlay'
import { InfoTip } from '../components/ui/InfoTip'

const CHASE_ROWS = 5
const thousands = (n: number) => String(Math.round(n / 1000))

type ChaseRow = { c: Customer; balance: number; bills: Bill[] }

/** P-D23 · the Sales & Accounts home: money in, money out and who to chase. */
export default function AccountsHome() {
  const router = useRouter()
  const user = useCurrentUser()
  const trade = useTrade()
  const [overlay, setOverlay] = useState<SaleOverlay>(null)
  const [paying, setPaying] = useState<string | null | 'new'>(null)

  const todayIso = todayISO()
  const today = trade.sales.filter((s) => (s.iso ?? '') === todayIso)
  const day = (iso: string) => salesIn(trade.sales, { from: iso, to: iso })
  const soldOn = (iso: string) => day(iso).reduce((n, s) => n + amountOf(s), 0)
  const collectedOn = (iso: string) => day(iso).reduce((n, s) => n + Math.min(s.paid, amountOf(s)), 0)
  const days = lastDays(8)
  const yesterday = addDays(todayIso, -1)
  const overdue = overdueToSuppliers(trade)
  const who = approvers(trade)
  const approved = today.filter((s) => !s.pendingApproval)
  const waiting = today.filter((s) => s.pendingApproval)
  const sold = approved.reduce((n, s) => n + amountOf(s), 0)
  const collected = approved.reduce((n, s) => n + s.paid, 0)
  const owed = trade.customers.reduce((n, c) => n + trade.customerBalance(c.id), 0)
  const owing = trade.customers.filter((c) => trade.customerBalance(c.id) > 0)
  const suppliers = trade.suppliers.map((s) => ({ s, balance: trade.supplierBalance(s.id) }))
  const weOwe = suppliers.filter((x) => x.balance > 0)
  const credit = suppliers.filter((x) => x.balance < 0)
  const first = waiting[0]
  const firstProduct = first && products.find((p) => p.id === first.productId)!
  const firstCustomer = first && trade.customers.find((c) => c.id === first.customerId)

  const kpis: Kpi[] = [
    kpi({ label: 'Sold today', value: thousands(sold), unit: 'thousand ₦', current: sold, previous: soldOn(yesterday), context: waiting.length ? `${approved.length} sales · + ₦${formatNumber(waiting.reduce((n, s) => n + amountOf(s), 0))} waiting` : `${approved.length} sales · vs yesterday`, info: explainMoney.soldToday(), spark: days.map(soldOn) }),
    kpi({ label: 'Collected today', value: thousands(collected), unit: 'thousand ₦', current: collected, previous: collectedOn(yesterday), context: sold ? `${Math.round((collected / sold) * 100)}% of today’s sales` : 'of today’s sales', info: explainMoney.collectedToday(), spark: days.map(collectedOn) }),
    kpi({ label: 'Owed to the farm', value: (owed / 1e6).toFixed(2), unit: 'million ₦', current: null, previous: null, goodWhen: 'neither', context: `${owing.length} customer${owing.length === 1 ? '' : 's'}`, info: explainMoney.owedToFarmNet(), spark: FLAT }),
    kpi({ label: 'We owe suppliers', value: thousands(weOwe.reduce((n, x) => n + x.balance, 0)), unit: 'thousand ₦', current: null, previous: null, goodWhen: 'neither', context: `${weOwe.length} supplier${weOwe.length === 1 ? '' : 's'} · ${overdue ? `₦${formatNumber(overdue)} past terms` : 'nothing overdue'}`, info: explainMoney.owedToSuppliers(), spark: FLAT }),
  ]

  const chase: ChaseRow[] = owing
    .map((c) => ({ c, balance: trade.customerBalance(c.id), bills: trade.customerOpenBills(c.id) }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, CHASE_ROWS)

  const chaseColumns: Column<ChaseRow>[] = [
    { key: 'c', header: 'Customer', render: (r) => <PrimaryCell initials={r.c.initials} title={r.c.name} subtitle={`Regular since ${r.c.since}`} /> },
    { key: 'balance', header: 'Balance', align: 'right', width: 120, render: (r) => <NumberCell>{formatNaira(r.balance)}</NumberCell> },
    {
      key: 'oldest',
      header: 'Oldest unpaid',
      align: 'right',
      width: 124,
      render: (r) => {
        const d = daysBetween(r.bills[0].date)
        return <NumberCell tone={d > farmSettings.overdueDebtDays ? 'danger' : 'default'}>{d} days</NumberCell>
      },
    },
    { key: 'wa', header: 'WhatsApp', width: 96, render: (r) => <TextCell>{r.c.whatsapp ? 'Opted in' : '—'}</TextCell> },
    {
      key: 'status',
      header: 'Status',
      width: 140,
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
        eyebrow={`${formatLongDate(farm.today)} · ${nowHM()}`}
        title={`${greeting(new Date(`${todayIso}T${nowHM()}:00`))}, ${user.name.split(' ')[0]}`}
        description="Money in, money out and who to chase. Every figure here is calculated from sales, purchases and payments."
        actions={
          <>
            <Button leadingIcon={Banknote} onClick={() => setPaying('new')}>
              Record payment
            </Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setOverlay({ kind: 'record' })}>
              Record sale
            </Button>
          </>
        }
      />

      {first && (
        <Alert tone="warning" icon={Clock} title={`Waiting for approval from ${who}`} actions={<Button onClick={() => setOverlay({ kind: 'detail', receipt: first.receipt })}>View sale</Button>}>
          {firstCustomer?.name ?? 'One-off buyer'} · {first.qty} {firstProduct.unit} at ₦{formatNumber(first.price)} (minimum ₦{formatNumber(firstProduct.minPrice)}) · ₦{formatNumber(amountOf(first))} · sent by you at {first.date.split(' ')[1]}. The receipt is held until it’s approved.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <Card>
        <CardHeader title="To chase" meta={<span className="type-body-sm text-fg-tertiary">Biggest balance first · WhatsApp reminders only where the customer opted in</span>} action={{ label: 'All customers', to: '/customers' }} />
        <Table
          columns={chaseColumns}
          rows={chase}
          rowKey={(r) => r.c.id}
          onRowClick={(r) => router.push(`/customers/${r.c.id}`)}
          actionsWidth={56}
          rowActions={(r) => (
            <RowMenu
              items={[
                { label: 'Open statement', onSelect: () => router.push(`/customers/${r.c.id}`) },
                { label: 'Record a payment', onSelect: () => setPaying(r.c.id) },
              ]}
            />
          )}
        />
      </Card>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1 px-6 pt-5 pb-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2">
            <h2 className="type-h3 text-fg-primary">Bills to pay</h2>
            <InfoTip label="Bills to pay">{explainMoney.owedToSuppliers()}</InfoTip>
            <span className="type-body-sm text-fg-tertiary">
              ₦{formatNumber(weOwe.reduce((n, x) => n + x.balance, 0))} to {weOwe.length} suppliers
              {credit.map((x) => ` · ${x.s.short} holds ₦${formatNumber(-x.balance)} credit for us`).join('')}
            </span>
          </div>
          <ul>
            {weOwe
              .sort((a, b) => b.balance - a.balance)
              .map((x, i) => {
                const bill = trade.supplierOpenBills(x.s.id)[0]
                const purchase = trade.purchases.find((p) => p.ref === bill?.ref)
                return (
                  <ListRow
                    key={x.s.id}
                    icon={Truck}
                    title={x.s.name}
                    detail={purchase ? `${purchase.item} · ${purchase.ref}, ${dayMonth(purchase.date)}` : x.s.supplies}
                    amount={`₦${formatNumber(x.balance)}`}
                    to={`/suppliers/${x.s.id}`}
                    last={i === weOwe.length - 1}
                  />
                )
              })}
          </ul>
        </Card>
        <Card className="min-w-0 flex-1 px-6 pt-5 pb-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2">
            <h2 className="type-h3 text-fg-primary">Today’s sales</h2>
            <InfoTip label="Today’s sales">{explainMoney.todaysSales()}</InfoTip>
            <span className="type-body-sm text-fg-tertiary">
              {today.length} receipts · ₦{formatNumber(today.reduce((n, s) => n + amountOf(s), 0))}
              {waiting.length ? ` incl. ${waiting.length} waiting` : ''}
            </span>
          </div>
          <ul>
            {today.map((s, i) => {
              const c = trade.customers.find((x) => x.id === s.customerId)
              const p = products.find((x) => x.id === s.productId)!
              const status = saleStatus(s, trade.saleLeft(s.receipt))
              return (
                <ListRow
                  key={s.receipt}
                  icon={Receipt}
                  title={c?.name ?? 'One-off buyer'}
                  detail={`${s.receipt} · ${s.date.split(' ')[1]} · ${s.qty} ${p.unitShort} · ${status === 'needs-approval' ? `waiting for ${who}` : statusBadge[status].label.toLowerCase()}`}
                  amount={`₦${formatNumber(amountOf(s))}`}
                  amountTone={s.pendingApproval ? 'text-fg-warning' : 'text-fg-primary'}
                  onClick={() => setOverlay({ kind: 'detail', receipt: s.receipt })}
                  last={i === today.length - 1}
                />
              )
            })}
          </ul>
        </Card>
      </div>

      <SaleOverlays overlay={overlay} setOverlay={setOverlay} />
      <Presence>{paying && <PaymentModal direction="in" partyId={paying === 'new' ? undefined : paying} onClose={() => setPaying(null)} />}</Presence>
    </>
  )
}

type ListRowProps = {
  icon: typeof Truck
  title: string
  detail: string
  amount: string
  amountTone?: string
  to?: string
  onClick?: () => void
  last?: boolean
}

function ListRow({ icon: Icon, title, detail, amount, amountTone = 'text-fg-primary', to, onClick, last }: ListRowProps) {
  const inner = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-icon-secondary">
        <Icon size={18} strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-label-lg text-fg-primary">{title}</span>
        <span className="truncate type-body-sm text-fg-secondary">{detail}</span>
      </span>
      <span className={`type-numeric-md ${amountTone}`}>{amount}</span>
      <ChevronRight size={16} strokeWidth={1.5} className="text-icon-secondary" />
    </>
  )
  const cls = `flex w-full cursor-pointer items-center gap-3 py-3 text-left ${last ? '' : 'border-b border-line-subtle'}`
  return <li>{to ? <Link href={to} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>}</li>
}
