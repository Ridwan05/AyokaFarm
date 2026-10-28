import { Button } from '../../components/ui/Button'
import { DetailSection, History } from '../../components/ui/Detail'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { amountOf, saleStatus, type Sale } from '../../data/sales'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canApprove } from '../../lib/access'
import { formatDayMonth, formatNumber } from '../../lib/format'
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
  const { customers, approveSale, rejectSale, customerBalance } = useTrade()
  const toast = useToast()
  const product = productOf(sale)
  const { name, customer } = customerView(sale, customers)
  const total = amountOf(sale)
  const left = total - sale.paid
  const status = saleStatus(sale)
  const pending = status === 'needs-approval'
  const [day, time] = sale.date.split(' ')
  const approver = currentUser.name.split(' ')[0]
  const balance = customer ? customerBalance(customer.id) : 0

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
      <Button size="lg" className="flex-1" onClick={() => toast(`Receipt ${sale.receipt} downloaded`)}>
        Download receipt
      </Button>
      <Button size="lg" variant="primary" className="flex-1" disabled={left <= 0} onClick={() => onRecordPayment(sale)}>
        Record a payment
      </Button>
    </>
  )

  return (
    <Drawer open onClose={onClose} title={`${sale.receipt} · ${name}`} subtitle={`${formatDayMonth(day)}, ${time} · recorded by ${sale.recordedBy}`} footer={footer}>
      <DetailSection title="Sale">
        <KeyValueRow label="Product">{product.name}</KeyValueRow>
        <KeyValueRow label="From">{product.from}</KeyValueRow>
        <KeyValueRow label="Quantity">
          {sale.qty} {product.unit}
        </KeyValueRow>
        <KeyValueRow label="Price">
          {naira(sale.price)} a {product.unit.replace(/s$/, '')}
          {sale.price === product.price && customer ? ' · last price' : ''}
        </KeyValueRow>
        <KeyValueRow label="Total" strong calculated>
          {naira(total)}
        </KeyValueRow>
      </DetailSection>

      <DetailSection title="Payment">
        <KeyValueRow label="Status">{statusBadge[status].label}</KeyValueRow>
        <KeyValueRow label="Paid now">
          {naira(sale.paid)}
          {sale.method ? ` · ${sale.method}` : ''}
        </KeyValueRow>
        <KeyValueRow label="Left on this sale" calculated>
          {naira(Math.max(left, 0))}
        </KeyValueRow>
        {customer &&
          (pending ? (
            <KeyValueRow label={`${customer.short}’s balance now`} strong calculated>
              {naira(balance)}
            </KeyValueRow>
          ) : (
            <KeyValueRow label={`${customer.short}’s balance after`} strong calculated>
              {left > 0 ? `${naira(balance - left)} → ${naira(balance)}` : naira(balance)}
            </KeyValueRow>
          ))}
      </DetailSection>

      <History events={sale.history} />
    </Drawer>
  )
}
