'use client'

import { Banknote, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { useToast } from '../../components/ui/toastContext'
import { aging, daysBetween } from '../../data/ledger'
import { useTrade } from '../../data/tradeContext'
import { AgingBar } from '../../features/customers/AgingBar'
import { agingLegend } from '../../features/customers/customerView'
import { PaymentModal } from '../../features/payments/PaymentModal'
import { StatementCard } from '../../features/statements/StatementCard'
import { formatNaira, formatNumber } from '../../lib/format'
import Placeholder from '../Placeholder'
import { Presence } from '../../components/ui/Overlay'

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export default function Statement() {
  const { customerId = '' } = useParams<{ customerId: string }>()
  const { customers, customerBalance, customerOpenBills, customerStatement, payments } = useTrade()
  const toast = useToast()
  const [paying, setPaying] = useState(false)
  const c = customers.find((x) => x.id === customerId)
  if (!c) return <Placeholder title="Customer not found" />

  const balance = customerBalance(c.id)
  const bills = customerOpenBills(c.id)
  const a = aging(bills)
  const lines = customerStatement(c.id)
  const sales = lines.reduce((n, l) => n + (l.charged ?? 0), 0)
  const paid = lines.reduce((n, l) => n + (l.paid ?? 0), 0)
  const lastPayment = payments.filter((p) => p.direction === 'in' && p.partyId === c.id).sort((x, y) => y.date.localeCompare(x.date))[0]
  const lastSalePaid = [...lines].reverse().find((l) => l.charged !== null && (l.paid ?? 0) > 0)
  const latest = lastPayment && (!lastSalePaid || lastPayment.date >= lastSalePaid.date) ? { amount: lastPayment.amount, date: lastPayment.date } : lastSalePaid ? { amount: lastSalePaid.paid!, date: lastSalePaid.date } : null

  return (
    <>
      <PageHeader
        backTo="/customers"
        eyebrow={['Customers', c.name]}
        title={c.name}
        description={`Regular customer since ${c.since} · ${c.buys} · ${c.area} · ${c.whatsapp ? 'receives statements on WhatsApp' : 'no WhatsApp — print statements'}`}
        actions={
          <>
            <Button leadingIcon={MessageCircle} onClick={() => toast(c.whatsapp ? `Statement sent to ${c.short}` : `${c.short} statement ready to print`)}>
              {c.whatsapp ? 'Send statement' : 'Print statement'}
            </Button>
            <Button variant="primary" leadingIcon={Banknote} disabled={balance <= 0} onClick={() => setPaying(true)}>
              Record payment
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="flex-1 gap-2 p-5">
          <span className="type-body-md text-fg-secondary">Balance owed</span>
          <span className="type-display-lg text-fg-primary">₦{formatNumber(balance)}</span>
          {a.over60 > 0 && <span className="type-body-sm text-fg-danger">₦{formatNumber(a.over60)} is over 60 days</span>}
          {latest && (
            <span className="type-body-sm text-fg-tertiary">
              Last payment ₦{formatNumber(latest.amount)} · {latest.date === '2026-10-09' ? 'today' : dmy(latest.date)}
            </span>
          )}
        </Card>
        <Card className="flex-1 gap-2 p-5">
          <span className="type-body-md text-fg-secondary">Aging</span>
          <AgingBar aging={a} className="w-full" />
          {agingLegend.map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${l.dot}`} />
              <span className="flex-1 type-body-md text-fg-secondary">{l.label}</span>
              {a[l.key] ? (
                <span className={l.key === 'over60' ? 'type-numeric-md text-fg-danger' : 'type-numeric-md text-fg-primary'}>{formatNaira(a[l.key])}</span>
              ) : (
                <span className="type-numeric-md text-fg-tertiary">—</span>
              )}
            </div>
          ))}
        </Card>
        <Card className="flex-1 gap-0 px-5 pt-4 pb-5">
          <span className="pb-1 type-body-md text-fg-secondary">Since go-live</span>
          <KeyValueRow label="Sales">{formatNaira(sales)}</KeyValueRow>
          <KeyValueRow label="Paid">{formatNaira(paid)}</KeyValueRow>
          <KeyValueRow label="Oldest unpaid">{bills[0] ? `${daysBetween(bills[0].date)} days` : '—'}</KeyValueRow>
          <span className="pt-1 type-body-sm text-fg-tertiary">Payments clear the oldest unpaid sale first</span>
        </Card>
      </div>

      <StatementCard lines={lines} side="customer" balance={balance} onDownload={() => toast(`${c.short} statement downloaded`)} />

      <Presence>{paying && <PaymentModal direction="in" partyId={c.id} onClose={() => setPaying(false)} />}</Presence>
    </>
  )
}
