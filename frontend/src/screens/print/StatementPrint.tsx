'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import type { StatementLine } from '../../data/ledger'
import { nowHM, todayISO } from '../../data/metrics'
import { agingLabels, agingOf } from '../../data/moneyKpis'
import { useTrade } from '../../data/tradeContext'
import { cn } from '../../lib/cn'
import { PrintSheet } from '../../features/print/PrintSheet'
import { dmy, money } from '../../features/print/printFormat'
import Placeholder from '../Placeholder'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Lines in the period, with everything before it brought forward as the opening balance. */
function forPeriod(lines: StatementLine[], from: string | null, to: string): StatementLine[] {
  const upTo = lines.filter((l) => l.date <= to)
  if (!from) return upTo
  const before = upTo.filter((l) => l.date < from)
  const opening = before.length ? before[before.length - 1].balance : 0
  return [{ date: from, entry: 'Balance brought forward', ref: null, charged: null, paid: null, balance: opening }, ...upTo.filter((l) => l.date >= from && l.entry !== 'Opening balance')]
}

/** A printable customer or supplier statement: /print/statement/customer/<id>?from=&to= */
export default function StatementPrint() {
  return (
    <Suspense>
      <Statement />
    </Suspense>
  )
}

function Statement() {
  const { kind = '', id = '' } = useParams<{ kind: string; id: string }>()
  const params = useSearchParams()
  const trade = useTrade()
  const isCustomer = kind === 'customer'
  const party = isCustomer ? trade.customers.find((c) => c.id === id) : kind === 'supplier' ? trade.suppliers.find((s) => s.id === id) : undefined
  if (!party) return <Placeholder title="Statement not found" />

  const today = todayISO()
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const from = fromParam && ISO.test(fromParam) ? fromParam : null
  const to = toParam && ISO.test(toParam) && toParam < today ? toParam : today
  const all = isCustomer ? trade.customerStatement(party.id) : trade.supplierStatement(party.id)
  const lines = forPeriod(all, from, to)
  const closing = lines.length ? lines[lines.length - 1].balance : 0
  const bills = isCustomer ? trade.customerOpenBills(party.id) : trade.supplierOpenBills(party.id)
  const aging = agingOf(bills)
  const labels = agingLabels()
  const charged = lines.reduce((n, l) => n + (l.charged ?? 0), 0)
  const paid = lines.reduce((n, l) => n + (l.paid ?? 0), 0)

  return (
    <PrintSheet kind={isCustomer ? 'Customer statement' : 'Supplier statement'} docRef={`ST-${party.id.slice(0, 4).toUpperCase()}-${today.replace(/-/g, '').slice(2)}`}>
      <div>
        <h1 className="type-display-md">{party.name}</h1>
        <p className="type-body-sm text-fg-secondary">
          {from ? `Period ${dmy(from)} – ${dmy(to)}` : `Since go-live to ${dmy(to)}`} · printed {dmy(today)} {nowHM()}
        </p>
      </div>
      <table className="w-full border-collapse type-body-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {['Date', 'Entry', 'Ref', isCustomer ? 'Charged' : 'Bought', 'Paid', isCustomer ? 'Balance' : 'We owe'].map((h, i) => (
              <th key={h} className={cn('py-2 type-overline text-fg-tertiary', i >= 3 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={`${l.date}-${l.ref ?? l.entry}-${i}`} className="break-inside-avoid border-b border-line-subtle align-top">
              <td className="py-2 pr-2 whitespace-nowrap text-fg-secondary">{dmy(l.date)}</td>
              <td className="py-2 pr-2">{l.entry}</td>
              <td className="py-2 pr-2 type-mono-sm text-fg-secondary">{l.ref ?? '–'}</td>
              <td className="py-2 text-right">{l.charged ? money(l.charged) : ''}</td>
              <td className="py-2 text-right">{l.paid ? money(l.paid) : ''}</td>
              <td className="py-2 text-right">{money(l.balance)}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-fg-tertiary">
                Nothing in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-1 flex-col gap-1">
          <span className="type-overline text-fg-tertiary">Unpaid, by age</span>
          {(['current', 'days31to60', 'over60'] as const).map((k) => (
            <div key={k} className="flex max-w-[280px] gap-3 type-body-sm">
              <span className="flex-1 text-fg-secondary">{labels[k]}</span>
              <span className={k === 'over60' && aging[k] ? 'text-fg-danger' : ''}>{money(aging[k])}</span>
            </div>
          ))}
        </div>
        <div className="flex w-full max-w-[320px] flex-col gap-1.5 sm:ml-auto">
          <div className="flex gap-3 type-body-md">
            <span className="flex-1 text-fg-secondary">{isCustomer ? 'Charged' : 'Bought'} in period</span>
            <span>{money(charged)}</span>
          </div>
          <div className="flex gap-3 type-body-md">
            <span className="flex-1 text-fg-secondary">Paid in period</span>
            <span>{money(paid)}</span>
          </div>
          <div className="flex items-baseline gap-3 border-t border-line pt-2">
            <span className="flex-1 type-label-md">{isCustomer ? 'Balance owed' : closing < 0 ? 'Credit they hold for us' : 'We owe'}</span>
            <span className="type-h2">{money(Math.abs(closing))}</span>
          </div>
        </div>
      </div>
      <p className="type-body-sm text-fg-secondary">
        Every line comes from a recorded {isCustomer ? 'sale' : 'purchase or expense'} or payment. Payments clear the oldest unpaid {isCustomer ? 'sale' : 'bill'} first.
      </p>
    </PrintSheet>
  )
}
