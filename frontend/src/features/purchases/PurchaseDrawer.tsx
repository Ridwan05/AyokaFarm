import { Button } from '../../components/ui/Button'
import { explainMoney } from '../../data/explainMoney'
import { explain } from '../../data/explain'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { DetailSection, History } from '../../components/ui/Detail'
import { totalOf, type Purchase } from '../../data/purchases'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canEditRecord, canVoidRecord } from '../records/recordRules'
import { formatNumber } from '../../lib/format'
import { dayMonth, formatQty, purchaseStatus } from './purchaseView'

const naira = (n: number) => `₦${formatNumber(n)}`

export function PurchaseDrawer({ purchase: p, onClose, onPay, onEdit, onVoid }: { purchase: Purchase; onClose: () => void; onPay: () => void; onEdit?: () => void; onVoid?: () => void }) {
  const { suppliers, supplierBalance, purchasePaid, payments, history } = useTrade()
  const user = useCurrentUser()
  const mayEdit = Boolean(onEdit) && canEditRecord(user, 'purchases', history.purchases.find((x) => x.ref === p.ref))
  const mayVoid = Boolean(onVoid) && canVoidRecord(user, 'purchases')
  const supplier = suppliers.find((s) => s.id === p.supplierId)!
  const total = totalOf(p)
  const paid = purchasePaid(p.ref)
  const left = total - paid
  const balance = supplierBalance(supplier.id)
  const paymentEvents = payments
    .filter((x) => x.direction === 'out' && x.cleared.includes(p.ref))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((x) => ({ title: `Paid ₦${formatNumber(x.amount)}`, detail: `By ${x.by} · ${x.method} · ${x.ref}`, time: dayMonth(x.date) }))

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${p.ref} · ${supplier.name}`}
      subtitle={`${dayMonth(p.date)}/${p.date.slice(0, 4)} · recorded by ${p.recordedBy}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={() => window.open(`/print/statement/supplier/${supplier.id}`, '_blank')}>
            Supplier statement
          </Button>
          <Button size="lg" variant="primary" className="flex-1" disabled={left <= 0} onClick={onPay}>
            Record a payment
          </Button>
        </>
      }
    >
      <DetailSection title="Purchase">
        <KeyValueRow label="Item">{p.item}</KeyValueRow>
        <KeyValueRow label="Quantity">{formatQty(p)}</KeyValueRow>
        <KeyValueRow label="Price">
          {naira(p.price)} {p.per}
        </KeyValueRow>
        {p.received && <KeyValueRow label="Received">{p.received}</KeyValueRow>}
        <KeyValueRow label="Total" strong calculated={explainMoney.purchaseTotal()}>
          {naira(total)}
        </KeyValueRow>
      </DetailSection>
      <DetailSection title="Payment">
        <KeyValueRow label="Status">{purchaseStatus(p, paid).label}</KeyValueRow>
        <KeyValueRow label="Paid" calculated={explainMoney.purchasePaid()}>
          {naira(paid)}
        </KeyValueRow>
        <KeyValueRow label={left < 0 ? 'Overpaid' : 'Left to pay'} calculated={explainMoney.leftToPay()}>
          {naira(Math.abs(left))}
        </KeyValueRow>
        <KeyValueRow label={`${supplier.short} balance now`} strong calculated={explain.supplierBalance()}>
          {balance > 0 ? `${naira(balance)} we owe` : balance < 0 ? `${naira(-balance)} credit` : '₦0'}
        </KeyValueRow>
      </DetailSection>
      {(mayEdit || mayVoid) && (
        <div className="flex flex-wrap gap-2 py-2">
          {mayEdit && (
            <Button size="sm" onClick={onEdit}>
              Correct purchase…
            </Button>
          )}
          {mayVoid && (
            <Button size="sm" variant="ghost" className="text-fg-danger" onClick={onVoid}>
              Void purchase…
            </Button>
          )}
        </div>
      )}
      <History events={[...paymentEvents, ...p.history]} />
    </Drawer>
  )
}
