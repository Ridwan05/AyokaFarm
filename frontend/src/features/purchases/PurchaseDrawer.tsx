import { Button } from '../../components/ui/Button'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { DetailSection, History } from '../../components/ui/Detail'
import { useToast } from '../../components/ui/toastContext'
import { totalOf, type Purchase } from '../../data/purchases'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { dayMonth, formatQty, purchaseStatus } from './purchaseView'

const naira = (n: number) => `₦${formatNumber(n)}`

export function PurchaseDrawer({ purchase: p, onClose, onPay }: { purchase: Purchase; onClose: () => void; onPay: () => void }) {
  const { suppliers, supplierBalance, purchasePaid, payments } = useTrade()
  const toast = useToast()
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
          <Button size="lg" className="flex-1" onClick={() => toast(`${p.ref} downloaded`)}>
            Download PDF
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
        <KeyValueRow label="Total" strong calculated>
          {naira(total)}
        </KeyValueRow>
      </DetailSection>
      <DetailSection title="Payment">
        <KeyValueRow label="Status">{purchaseStatus(p, paid).label}</KeyValueRow>
        <KeyValueRow label="Paid">{naira(paid)}</KeyValueRow>
        <KeyValueRow label={left < 0 ? 'Overpaid' : 'Left to pay'} calculated>
          {naira(Math.abs(left))}
        </KeyValueRow>
        <KeyValueRow label={`${supplier.short} balance now`} strong calculated>
          {balance > 0 ? `${naira(balance)} we owe` : balance < 0 ? `${naira(-balance)} credit` : '₦0'}
        </KeyValueRow>
      </DetailSection>
      <History events={[...paymentEvents, ...p.history]} />
    </Drawer>
  )
}
