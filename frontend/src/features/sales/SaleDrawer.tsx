import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { DetailSection, History } from '../../components/ui/Detail'
import { explainMoney } from '../../data/explainMoney'
import { explain } from '../../data/explain'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { amountOf, saleStatus, type Sale } from '../../data/sales'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { can, canApprove } from '../../lib/access'
import { farmSettings } from '../../data/farmSettings'
import { daysFrom, todayISO } from '../../data/metrics'
import { weekdayDayMonth } from '../../data/metrics'
import { saleDate } from '../../data/moneyKpis'
import { formatNumber } from '../../lib/format'
import { PenPortions } from './PenPortions'
import { parsePortions, penChoices, portionError, portionRows, type PortionRow } from './portionRules'
import { customerView, productOf, statusBadge } from './saleView'

const naira = (n: number) => `₦${formatNumber(n)}`

type Props = {
  sale: Sale
  onClose: () => void
  onRecordPayment: (sale: Sale) => void
}

/** Sale detail: what was sold, how it was paid, and its history. */
export function SaleDrawer({ sale, onClose, onRecordPayment }: Props) {
  const currentUser = useCurrentUser()
  const trade = useTrade()
  const { customers, approveSale, rejectSale, customerBalance, setSaleAllocations } = trade
  const toast = useToast()
  const product = productOf(sale)
  const { name, customer } = customerView(sale, customers)
  const total = amountOf(sale)
  const left = total - sale.paid
  const status = saleStatus(sale)
  const pending = status === 'needs-approval'
  const time = sale.date.split(' ')[1]
  const approver = currentUser.name.split(' ')[0]
  const balance = customer ? customerBalance(customer.id) : 0
  const portions = sale.allocations ?? []
  const birds = product.kind === 'Birds'
  const penName = (id: number) => trade.catalog.pens.find((p) => p.id === id)?.name ?? `Pen ${id}`
  // Same rule as the database: managers, sales editors, or whoever recorded it within the edit window.
  const mayEdit =
    canApprove(currentUser.role) ||
    can(currentUser, 'sales', 'edit') ||
    (can(currentUser, 'sales', 'add') && sale.recordedBy === currentUser.name.split(' ')[0] && daysFrom(saleDate(sale), todayISO()) <= farmSettings.editWindowDays)
  const [editing, setEditing] = useState<PortionRow[] | null>(null)
  const [saving, setSaving] = useState(false)
  const choices = penChoices(trade, sale.productId, sale.receipt)
  const problem = editing && (birds || editing.length) ? portionError(editing, choices, sale.qty, product.unit) : ''

  const savePortions = async (rows: PortionRow[]) => {
    setSaving(true)
    const ok = await setSaleAllocations(sale.receipt, parsePortions(rows))
    setSaving(false)
    if (!ok) return
    toast(rows.length ? `Pens saved for ${sale.receipt}` : `${sale.receipt} set to auto-split`)
    setEditing(null)
  }

  const footer = pending && !canApprove(currentUser.role) ? (
    <Button size="lg" className="flex-1" onClick={onClose}>
      Close · waiting for approval
    </Button>
  ) : pending ? (
    <>
      <Button
        size="lg"
        className="flex-1"
        onClick={async () => {
          if (!(await rejectSale(sale.receipt))) return
          toast(`${sale.receipt} rejected`)
          onClose()
        }}
      >
        Reject
      </Button>
      <Button
        size="lg"
        variant="primary"
        className="flex-1"
        onClick={async () => {
          if (!(await approveSale(sale.receipt, approver))) return
          toast(`${sale.receipt} approved`)
          onClose()
        }}
      >
        Approve
      </Button>
    </>
  ) : (
    <>
      <Button size="lg" className="flex-1" onClick={() => window.open(`/print/receipt/${encodeURIComponent(sale.receipt)}`, '_blank')}>
        Receipt PDF
      </Button>
      <Button size="lg" variant="primary" className="flex-1" disabled={left <= 0} onClick={() => onRecordPayment(sale)}>
        Record a payment
      </Button>
    </>
  )

  return (
    <Drawer open onClose={onClose} title={`${sale.receipt} · ${name}`} subtitle={`${weekdayDayMonth(saleDate(sale))}, ${time} · recorded by ${sale.recordedBy}`} footer={footer}>
      <DetailSection title="Sale">
        <KeyValueRow label="Product">{product.name}</KeyValueRow>
        <KeyValueRow label="Quantity">
          {sale.qty} {product.unit}
        </KeyValueRow>
        <KeyValueRow label="Price">
          {naira(sale.price)} a {product.unit.replace(/s$/, '')}
          {sale.price === product.price && customer ? ' · last price' : ''}
        </KeyValueRow>
        <KeyValueRow label="Total" strong calculated={explain.saleTotal()}>
          {naira(total)}
        </KeyValueRow>
      </DetailSection>

      <DetailSection title="From pens">
        {editing ? (
          <div className="flex flex-col gap-3 py-2">
            <PenPortions choices={choices} rows={editing} onChange={setEditing} total={sale.qty} unit={product.unit} showErrors />
            {problem && <p className="type-body-sm text-fg-danger">{problem}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={saving || Boolean(problem)} onClick={() => void savePortions(editing)}>
                {saving ? 'Saving…' : 'Save pens'}
              </Button>
              {!birds && (
                <Button size="sm" disabled={saving} onClick={() => void savePortions([])}>
                  Auto-split instead
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {portions.length ? (
              portions.map((a) => (
                <KeyValueRow key={a.penId} label={penName(a.penId)} calculated={explain.penPortion()}>
                  {formatNumber(a.qty)} {product.unit} · {naira(a.qty * sale.price)}
                </KeyValueRow>
              ))
            ) : (
              <p className="py-2 type-body-md text-fg-secondary">
                {birds ? 'No pen recorded for these birds.' : 'Auto-split: reports share this sale across pens by eggs collected.'}
              </p>
            )}
            {mayEdit && (
              <div className="pt-1 pb-2">
                <Button size="sm" onClick={() => setEditing(portions.length ? portionRows(portions) : choices[0] ? [{ penId: choices[0].penId, qty: formatNumber(sale.qty) }] : [])}>
                  {portions.length ? 'Edit pens…' : 'Split across pens…'}
                </Button>
              </div>
            )}
          </>
        )}
      </DetailSection>

      <DetailSection title="Payment">
        <KeyValueRow label="Status">{statusBadge[status].label}</KeyValueRow>
        <KeyValueRow label="Paid now">
          {naira(sale.paid)}
          {sale.method ? ` · ${sale.method}` : ''}
        </KeyValueRow>
        <KeyValueRow label="Left on this sale" calculated={explain.leftOnSale()}>
          {naira(Math.max(left, 0))}
        </KeyValueRow>
        {customer &&
          (pending ? (
            <KeyValueRow label={`${customer.short}’s balance now`} strong calculated={explain.customerBalance()}>
              {naira(balance)}
            </KeyValueRow>
          ) : (
            <KeyValueRow label={`${customer.short}’s balance after`} strong calculated={explainMoney.balanceAfterSale()}>
              {left > 0 ? `${naira(balance - left)} → ${naira(balance)}` : naira(balance)}
            </KeyValueRow>
          ))}
      </DetailSection>

      <History events={sale.history} />
    </Drawer>
  )
}
