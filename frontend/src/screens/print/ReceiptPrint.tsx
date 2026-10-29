'use client'

import { useParams } from 'next/navigation'
import { amountOf, saleStatus } from '../../data/sales'
import { saleDate } from '../../data/moneyKpis'
import { useTrade } from '../../data/tradeContext'
import { customerView, productOf, statusBadge } from '../../features/sales/saleView'
import { PrintSheet } from '../../features/print/PrintSheet'
import { dmy, money } from '../../features/print/printFormat'
import Placeholder from '../Placeholder'

const METHOD = { cash: 'Cash', transfer: 'Transfer', POS: 'POS' } as const

/** A printable receipt for one sale (Sales › ··· › Receipt PDF). */
export default function ReceiptPrint() {
  const { ref = '' } = useParams<{ ref: string }>()
  const { sales, customers, customerBalance } = useTrade()
  const sale = sales.find((s) => s.receipt === decodeURIComponent(ref))
  if (!sale) return <Placeholder title="Receipt not found" />

  const product = productOf(sale)
  const { name, customer } = customerView(sale, customers)
  const total = amountOf(sale)
  const left = Math.max(0, total - sale.paid)
  const status = saleStatus(sale)
  const time = sale.date.split(' ')[1] ?? ''

  return (
    <PrintSheet kind="Receipt" docRef={sale.receipt}>
      <h1 className="sr-only">Receipt {sale.receipt}</h1>
      {status === 'needs-approval' && (
        <p className="rounded-md bg-warning-subtle px-3 py-2 type-label-md text-fg-warning">Waiting for approval — this is not a valid receipt yet.</p>
      )}
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Fact label="Sold to">{name}</Fact>
        <Fact label="Date">
          {dmy(saleDate(sale))} {time}
        </Fact>
        <Fact label="Served by">{sale.recordedBy}</Fact>
      </div>
      <table className="w-full border-collapse type-body-md">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-2 type-overline text-fg-tertiary">Item</th>
            <th className="py-2 text-right type-overline text-fg-tertiary">Qty</th>
            <th className="py-2 text-right type-overline text-fg-tertiary">Price</th>
            <th className="py-2 text-right type-overline text-fg-tertiary">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line-subtle">
            <td className="py-3">{product.name}</td>
            <td className="py-3 text-right">
              {sale.qty.toLocaleString('en-NG')} {product.unitShort}
            </td>
            <td className="py-3 text-right">{money(sale.price)}</td>
            <td className="py-3 text-right">{money(total)}</td>
          </tr>
        </tbody>
      </table>
      <div className="ml-auto flex w-full max-w-[320px] flex-col gap-1.5">
        <Row label="Total" strong>
          {money(total)}
        </Row>
        <Row label={`Paid${sale.method ? ` · ${METHOD[sale.method]}` : ''}`}>{money(sale.paid)}</Row>
        <Row label="Left on this sale">{money(left)}</Row>
        {customer && (
          <Row label={`${customer.short}’s balance now`} strong>
            {money(customerBalance(customer.id))}
          </Row>
        )}
        <span className="pt-1 text-right type-body-sm text-fg-tertiary">{statusBadge[status].label}</span>
      </div>
    </PrintSheet>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="type-overline text-fg-tertiary">{label}</span>
      <span className="type-label-lg">{children}</span>
    </div>
  )
}

function Row({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className={`flex-1 ${strong ? 'type-label-md' : 'type-body-md text-fg-secondary'}`}>{label}</span>
      <span className={strong ? 'type-numeric-lg' : 'type-numeric-md'}>{children}</span>
    </div>
  )
}
