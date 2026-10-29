import { Badge } from '../../components/ui/Badge'
import { RowMenu } from '../../components/ui/Menu'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { amountOf, saleStatus, type Sale } from '../../data/sales'
import { useTrade } from '../../data/tradeContext'
import { formatNaira } from '../../lib/format'
import { customerView, productOf, statusBadge } from './saleView'

type Props = {
  sales: Sale[]
  onOpen: (sale: Sale) => void
  onRecordPayment: (sale: Sale) => void
}

export function SalesTable({ sales, onOpen, onRecordPayment }: Props) {
  const { customers } = useTrade()
  const toast = useToast()

  const columns: Column<Sale>[] = [
    { key: 'receipt', header: 'Receipt', width: 81, render: (s) => <TextCell tone="primary" mono>{s.receipt}</TextCell> },
    { key: 'date', header: 'Date', width: 112, render: (s) => <TextCell>{s.date}</TextCell> },
    {
      key: 'customer',
      header: 'Customer',
      render: (s) => {
        const c = customerView(s, customers)
        return <PrimaryCell initials={c.initials} title={c.name} subtitle={c.subtitle} />
      },
    },
    { key: 'product', header: 'Product', width: 140, render: (s) => <TextCell>{productOf(s).short}</TextCell> },
    { key: 'qty', header: 'Qty', align: 'right', width: 84, render: (s) => <NumberCell>{s.qty} {productOf(s).unitShort}</NumberCell> },
    { key: 'amount', header: 'Amount', align: 'right', width: 112, render: (s) => <NumberCell>{formatNaira(amountOf(s))}</NumberCell> },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      width: 112,
      render: (s) =>
        s.pendingApproval || (s.approvedAt && !s.paid) ? <NumberCell tone="muted">—</NumberCell> : <NumberCell>{formatNaira(s.paid)}</NumberCell>,
    },
    {
      key: 'status',
      header: 'Status',
      width: 150,
      render: (s) => {
        const b = statusBadge[saleStatus(s)]
        return (
          <Badge dot tone={b.tone}>
            {b.label}
          </Badge>
        )
      },
    },
  ]

  return (
    <Table
      columns={columns}
      rows={sales}
      rowKey={(s) => s.receipt}
      onRowClick={onOpen}
      actionsWidth={56}
      rowClassName={(s) => (s.pendingApproval || s.approvedAt ? 'bg-accent-subtle hover:bg-accent-subtle' : undefined)}
      rowActions={(s) => (
        <RowMenu
          items={[
            { label: 'View details', onSelect: () => onOpen(s) },
            { label: 'Receipt PDF', onSelect: () => window.open(`/print/receipt/${encodeURIComponent(s.receipt)}`, '_blank'), disabled: s.pendingApproval },
            { label: 'Send on WhatsApp', onSelect: () => toast('WhatsApp isn’t connected yet — open the receipt PDF and share it instead'), disabled: s.pendingApproval },
            { label: 'Record a payment', onSelect: () => onRecordPayment(s), disabled: s.paid >= amountOf(s) || s.pendingApproval },
            { label: 'Edit sale', onSelect: () => onOpen(s) },
            { label: 'Void sale…', danger: true, onSelect: () => toast(`Voiding needs a reason — open ${s.receipt} to void it`) },
          ]}
        />
      )}
    />
  )
}
