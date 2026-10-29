'use client'

import { Banknote, Pencil, Printer } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { daysBetween } from '../../data/ledger'
import { agingOf } from '../../data/moneyKpis'
import { useTrade } from '../../data/tradeContext'
import { useCurrentUser } from '../../data/sessionContext'
import { can } from '../../lib/access'
import { EditCustomerModal } from '../../features/customers/EditCustomerModal'
import { AgingBar } from '../../features/customers/AgingBar'
import { agingLegend } from '../../features/customers/customerView'
import { PaymentModal } from '../../features/payments/PaymentModal'
import { StatementCard } from '../../features/statements/StatementCard'
import { farmSettings } from '../../data/farmSettings'
import { todayISO } from '../../data/metrics'
import { formatNaira, formatNumber } from '../../lib/format'
import Placeholder from '../Placeholder'
import { Presence } from '../../components/ui/Overlay'
import { InfoTip } from '../../components/ui/InfoTip'
import { explain } from '../../data/explain'
import { explainMoney } from '../../data/explainMoney'

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export default function Statement() {
  const { customerId = '' } = useParams<{ customerId: string }>()
  const { customers, customerBalance, customerOpenBills, customerStatement, payments } = useTrade()
  const user = useCurrentUser()
  const [paying, setPaying] = useState(false)
  const [editing, setEditing] = useState(false)
  const c = customers.find((x) => x.id === customerId)
  if (!c) return <Placeholder title="Customer not found" />

  const balance = customerBalance(c.id)
  const bills = customerOpenBills(c.id)
  const a = agingOf(bills)
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
        description={`Regular customer since ${c.since} · ${c.buys} · ${c.area} · ${c.whatsapp ? 'agreed to WhatsApp statements (not connected yet)' : 'no WhatsApp — print statements'}`}
        actions={
          <>
            {can(user, 'parties', 'edit') && (
              <Button leadingIcon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <Button leadingIcon={Printer} onClick={() => window.open(`/print/statement/customer/${c.id}`, '_blank')}>
              Statement PDF
            </Button>
            <Button variant="primary" leadingIcon={Banknote} disabled={balance <= 0} onClick={() => setPaying(true)}>
              Record payment
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="flex-1 gap-2 p-5">
          <span className="flex items-center gap-1.5 type-body-md text-fg-secondary">
            Balance owed
            <InfoTip label="Balance owed">{explain.customerBalance()}</InfoTip>
          </span>
          <span className="type-display-lg text-fg-primary">₦{formatNumber(balance)}</span>
          {a.over60 > 0 && (
            <span className="flex items-center gap-1.5 type-body-sm text-fg-danger">
              ₦{formatNumber(a.over60)} is over {farmSettings.overdueDebtDays} days
              <InfoTip label="Overdue">{explain.overdue()}</InfoTip>
            </span>
          )}
          {latest && (
            <span className="flex items-center gap-1.5 type-body-sm text-fg-tertiary">
              Last payment ₦{formatNumber(latest.amount)} · {latest.date === todayISO() ? 'today' : dmy(latest.date)}
              <InfoTip label="Last payment">{explainMoney.lastPayment()}</InfoTip>
            </span>
          )}
        </Card>
        <Card className="flex-1 gap-2 p-5">
          <span className="flex items-center gap-1.5 type-body-md text-fg-secondary">
            Aging
            <InfoTip label="Aging">{explain.ageing()}</InfoTip>
          </span>
          <AgingBar aging={a} className="w-full" />
          {agingLegend().map((l) => (
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
          <KeyValueRow label="Sales" calculated={explainMoney.sinceGoLiveSales()}>
            {formatNaira(sales)}
          </KeyValueRow>
          <KeyValueRow label="Paid" calculated={explainMoney.sinceGoLivePaid()}>
            {formatNaira(paid)}
          </KeyValueRow>
          <KeyValueRow label="Oldest unpaid" calculated={explainMoney.oldestUnpaid()}>
            {bills[0] ? `${daysBetween(bills[0].date)} days` : '—'}
          </KeyValueRow>
          <span className="pt-1 type-body-sm text-fg-tertiary">Payments clear the oldest unpaid sale first</span>
        </Card>
      </div>

      <StatementCard lines={lines} side="customer" balance={balance} exportName={`statement-${c.short.toLowerCase().replace(/\W+/g, '-')}`} onDownload={(r) => window.open(`/print/statement/customer/${c.id}${r.from ? `?from=${r.from}&to=${r.to}` : ''}`, '_blank')} />

      <Presence>{paying && <PaymentModal direction="in" partyId={c.id} onClose={() => setPaying(false)} />}</Presence>
      <Presence>{editing && <EditCustomerModal customerId={c.id} onClose={() => setEditing(false)} />}</Presence>
    </>
  )
}
