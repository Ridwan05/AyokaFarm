'use client'

import { Banknote, Printer } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { daysBetween, TODAY_ISO } from '../../data/ledger'
import { agingOf } from '../../data/moneyKpis'
import { useTrade } from '../../data/tradeContext'
import { AgingBar } from '../../features/customers/AgingBar'
import { agingLegend } from '../../features/customers/customerView'
import { PaymentModal } from '../../features/payments/PaymentModal'
import { dayMonth } from '../../features/purchases/purchaseView'
import { StatementCard } from '../../features/statements/StatementCard'
import { formatNaira, formatNumber, formatShortDate, parseISODate } from '../../lib/format'
import Placeholder from '../Placeholder'
import { Presence } from '../../components/ui/Overlay'

const addDays = (iso: string, days: number) => {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return d
}

export default function SupplierStatement() {
  const { supplierId = '' } = useParams<{ supplierId: string }>()
  const { suppliers, supplierBalance, supplierOpenBills, supplierStatement, payments } = useTrade()
  const [paying, setPaying] = useState(false)
  const s = suppliers.find((x) => x.id === supplierId)
  if (!s) return <Placeholder title="Supplier not found" />

  const balance = supplierBalance(s.id)
  const bills = supplierOpenBills(s.id)
  const a = agingOf(bills)
  const lines = supplierStatement(s.id)
  const bought = lines.reduce((n, l) => n + (l.charged ?? 0), 0)
  const paid = lines.reduce((n, l) => n + (l.paid ?? 0), 0)
  const due = bills[0] ? addDays(bills[0].date, s.termsDays) : null
  const overdue = due ? daysBetween(TODAY_ISO, due.toISOString().slice(0, 10)) < 0 : false
  const last = payments.filter((p) => p.direction === 'out' && p.partyId === s.id).sort((x, y) => y.date.localeCompare(x.date))[0]

  return (
    <>
      <PageHeader
        backTo="/suppliers"
        eyebrow={['Suppliers', s.name]}
        title={s.name}
        description={`${s.kind} supplier since ${s.since} · ${s.supplies.toLowerCase()} · ${s.phone} · ${s.termsDays ? `pay within ${s.termsDays} days` : 'pay on delivery'}`}
        actions={
          <>
            <Button leadingIcon={Printer} onClick={() => window.open(`/print/statement/supplier/${s.id}`, '_blank')}>
              Statement PDF
            </Button>
            <Button variant="primary" leadingIcon={Banknote} disabled={balance <= 0} onClick={() => setPaying(true)}>
              Pay supplier
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="flex-1 gap-2 p-5">
          <span className="type-body-md text-fg-secondary">{balance < 0 ? 'They hold for us' : 'We owe'}</span>
          <span className="type-display-lg text-fg-primary">₦{formatNumber(Math.abs(balance))}</span>
          <span className={overdue ? 'type-body-sm text-fg-danger' : 'type-body-sm text-fg-secondary'}>
            {due ? `${overdue ? 'Overdue' : 'Nothing overdue'} · due ${formatShortDate(due)}` : balance < 0 ? 'Used against the next purchase' : 'Nothing owed'}
          </span>
          {last && (
            <span className="type-body-sm text-fg-tertiary">
              Last payment ₦{formatNumber(last.amount)} · {dayMonth(last.date)} · {last.method}
            </span>
          )}
        </Card>
        <Card className="flex-1 gap-2 p-5">
          <span className="type-body-md text-fg-secondary">Aging</span>
          <AgingBar aging={a} className="w-full" />
          {agingLegend().map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${l.dot}`} />
              <span className="flex-1 type-body-md text-fg-secondary">{l.label}</span>
              {a[l.key] ? <span className="type-numeric-md text-fg-primary">{formatNaira(a[l.key])}</span> : <span className="type-numeric-md text-fg-tertiary">—</span>}
            </div>
          ))}
        </Card>
        <Card className="flex-1 gap-0 px-5 pt-4 pb-5">
          <span className="pb-1 type-body-md text-fg-secondary">Since go-live</span>
          <KeyValueRow label="Bought">{formatNaira(bought)}</KeyValueRow>
          <KeyValueRow label="Paid">{formatNaira(paid)}</KeyValueRow>
          <KeyValueRow label="Purchases">{lines.filter((l) => l.charged !== null).length}</KeyValueRow>
          <span className="pt-1 type-body-sm text-fg-tertiary">Payments clear the oldest unpaid purchase first</span>
        </Card>
      </div>

      <StatementCard lines={lines} side="supplier" balance={balance} exportName={`statement-${s.short.toLowerCase().replace(/\W+/g, '-')}`} onDownload={(r) => window.open(`/print/statement/supplier/${s.id}${r.from ? `?from=${r.from}&to=${r.to}` : ''}`, '_blank')} />

      <Presence>{paying && <PaymentModal direction="out" partyId={s.id} onClose={() => setPaying(false)} />}</Presence>
    </>
  )
}
