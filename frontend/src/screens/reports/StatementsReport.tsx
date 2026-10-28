'use client'

import Image from 'next/image'
import { Download, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SearchInput } from '../../components/ui/Form'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/toastContext'
import type { StatementLine } from '../../data/ledger'
import { useTrade } from '../../data/tradeContext'
import { SendStatementsModal } from '../../features/customers/SendStatementsModal'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { ReportHeader } from './ReportHeader'
import { Presence } from '../../components/ui/Overlay'

const PERIOD_FROM = '2026-09-01'
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Lines from the period start, with the balance brought forward as the opening line. */
function forPeriod(lines: StatementLine[]): StatementLine[] {
  const before = lines.filter((l) => l.date < PERIOD_FROM)
  const opening = before.length ? before[before.length - 1].balance : 0
  return [{ date: PERIOD_FROM, entry: 'Opening balance', ref: null, charged: null, paid: null, balance: opening }, ...lines.filter((l) => l.date >= PERIOD_FROM && l.entry !== 'Opening balance')]
}

export default function StatementsReport() {
  const trade = useTrade()
  const toast = useToast()
  const [side, setSide] = useState<'Customers' | 'Suppliers'>('Suppliers')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [weekly, setWeekly] = useState(true)
  const [sending, setSending] = useState(false)

  const isCustomer = side === 'Customers'
  const parties = (isCustomer ? trade.customers : trade.suppliers).map((p) => ({
    id: p.id,
    name: p.name,
    balance: isCustomer ? trade.customerBalance(p.id) : trade.supplierBalance(p.id),
  }))
  const q = query.trim().toLowerCase()
  const visible = parties.filter((p) => !q || p.name.toLowerCase().includes(q))
  const party = parties.find((p) => p.id === selected) ?? parties[0]
  const lines = forPeriod(isCustomer ? trade.customerStatement(party.id) : trade.supplierStatement(party.id))
  const dueCount = trade.customers.filter((c) => c.whatsapp && trade.customerBalance(c.id) > 0).length
  const tabs = [`Customers · ${trade.customers.length}`, `Suppliers · ${trade.suppliers.length}`]

  const balanceLabel = (b: number) =>
    isCustomer ? (b > 0 ? `Owes ₦${formatNumber(b)}` : '₦0') : b > 0 ? `We owe ₦${formatNumber(b)}` : b < 0 ? `Credit ₦${formatNumber(-b)}` : '₦0'

  return (
    <>
      <ReportHeader
        title="Statements"
        description="Running-balance statements for any customer or supplier, ready to print or send on WhatsApp (FR-SUP-1, FR-CUS-2)."
        actions={
          <Button leadingIcon={MessageCircle} onClick={() => setSending(true)}>
            Send all due
          </Button>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[360px]">
          <Card className="gap-3 p-5">
            <h2 className="type-h3 text-fg-primary">Parties</h2>
            <SegmentedControl
              fullWidth
              label="Party type"
              options={tabs}
              value={isCustomer ? tabs[0] : tabs[1]}
              onChange={(t) => {
                const s = t.startsWith('Customers') ? 'Customers' : 'Suppliers'
                setSide(s)
                setSelected(s === 'Customers' ? trade.customers[0].id : trade.suppliers[0].id)
              }}
            />
            <SearchInput label={`Search ${side.toLowerCase()}`} placeholder={`Search ${side.toLowerCase()}`} width={318} value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="flex flex-col">
              {visible.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={cn('flex h-11 w-full cursor-pointer items-center rounded-md px-3 text-left', p.id === party.id ? 'bg-subtle' : 'hover:bg-canvas')}
                  >
                    <span className="flex-1 truncate type-body-md text-fg-primary">{p.name}</span>
                    <span className={cn('type-label-md', p.balance === 0 ? 'text-fg-tertiary' : !isCustomer && p.balance < 0 ? 'text-fg-success' : 'text-fg-primary')}>
                      {balanceLabel(p.balance)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="gap-2 p-5">
            <h2 className="type-h3 text-fg-primary">Weekly reminders</h2>
            <Switch label="Send customer statements every week" checked={weekly} onChange={setWeekly} />
            <p className="type-body-sm text-fg-secondary">
              Mondays at 09:00 to the {dueCount} customers who have a balance and agreed to WhatsApp. Next run: Mon 12 Oct.
            </p>
            <button type="button" className="cursor-pointer self-start type-label-sm text-fg-brand hover:underline">
              Edit message template
            </button>
          </Card>
        </div>

        <Card className="min-w-0 flex-1 gap-4 p-5">
          <div className="flex items-baseline gap-2">
            <h2 className="type-h3 text-fg-primary">Preview</h2>
            <span className="type-body-sm text-fg-tertiary">A4 · PDF</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex-1 basis-full type-body-sm text-fg-secondary sm:basis-auto">{party.name} · 01/09/2026 – 09/10/2026</span>
            <Button leadingIcon={Download} onClick={() => toast(`${party.name} statement downloaded`)}>
              Download PDF
            </Button>
            <Button variant="primary" leadingIcon={MessageCircle} onClick={() => toast(`Statement sent to ${party.name}`)}>
              Send on WhatsApp
            </Button>
          </div>
          <div className="rounded-lg bg-canvas p-2 sm:p-6">
            <article className="mx-auto flex max-w-[640px] flex-col gap-5 bg-surface p-4 shadow-xs sm:p-8">
              <header className="flex items-start gap-3">
                <Image src="/logo-mark.svg" width={18} height={23} alt="" className="mt-1" />
                <div className="flex flex-1 flex-col">
                  <span className="type-label-lg text-fg-primary">AyokaFarm</span>
                  <span className="type-body-sm text-fg-tertiary">Poultry & eggs · Oyo State</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="type-overline text-fg-tertiary">{isCustomer ? 'Customer statement' : 'Supplier statement'}</span>
                  <span className="type-mono-sm text-fg-secondary">ST-{party.id.slice(0, 2).toUpperCase()}-1009</span>
                </div>
              </header>
              <div>
                <h3 className="type-display-md text-fg-primary">{party.name}</h3>
                <p className="type-body-sm text-fg-secondary">Period 01/09/2026 – 09/10/2026 · printed 09/10/2026 16:40</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse type-body-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      {['Date', 'Entry', 'Ref', isCustomer ? 'Charged' : 'Bought', 'Paid', 'Balance'].map((h, i) => (
                        <th key={h} className={cn('py-2 type-overline text-fg-tertiary', i >= 3 && 'text-right')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={`${l.date}-${l.ref ?? l.entry}`} className="border-b border-line-subtle align-top">
                        <td className="py-2.5 text-fg-secondary">{dm(l.date)}</td>
                        <td className="py-2.5 pr-2 text-fg-primary">{l.entry.replace(/^(Sale|Purchase) · /, '')}</td>
                        <td className="py-2.5 type-mono-sm text-fg-secondary">{l.ref ?? '–'}</td>
                        <td className="py-2.5 text-right text-fg-primary">{l.charged ? `₦${formatNumber(l.charged)}` : ''}</td>
                        <td className={cn('py-2.5 text-right', l.charged === null && l.paid ? 'text-fg-success' : 'text-fg-primary')}>{l.paid ? `₦${formatNumber(l.paid)}` : ''}</td>
                        <td className="py-2.5 text-right text-fg-primary">₦{formatNumber(l.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center">
                <span className="flex-1 type-label-md text-fg-primary">
                  {isCustomer ? `Balance ${party.name} owes AyokaFarm` : `Balance AyokaFarm owes ${party.name}`}
                </span>
                <span className="type-h2 text-fg-primary">₦{formatNumber(Math.abs(party.balance))}</span>
              </div>
              <p className="type-body-sm text-fg-secondary">Every line comes from a recorded {isCustomer ? 'sale' : 'purchase'} or payment. Questions: Funmi Adebayo, Accounts.</p>
            </article>
          </div>
        </Card>
      </div>

      <Presence>{sending && <SendStatementsModal onClose={() => setSending(false)} />}</Presence>
    </>
  )
}
