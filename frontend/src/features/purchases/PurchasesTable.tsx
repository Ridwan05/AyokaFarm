import { Badge } from '../../components/ui/Badge'
import { RowMenu } from '../../components/ui/Menu'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { totalOf, type Purchase } from '../../data/purchases'
import { useTrade } from '../../data/tradeContext'
import { formatNaira } from '../../lib/format'
import { dayMonth, formatQty, purchaseStatus } from './purchaseView'

type Props = {
  purchases: Purchase[]
  onOpen: (p: Purchase) => void
  onPay: (p: Purchase) => void
}

export function PurchasesTable({ purchases, onOpen, onPay }: Props) {
  const { suppliers, purchasePaid } = useTrade()
  const toast = useToast()

  const columns: Column<Purchase>[] = [
    { key: 'ref', header: 'Ref', width: 88, render: (p) => <TextCell tone="primary" mono>{p.ref}</TextCell> },
    { key: 'date', header: 'Date', width: 80, render: (p) => <TextCell>{dayMonth(p.date)}</TextCell> },
    {
      key: 'supplier',
      header: 'Supplier',
      width: 254,
      render: (p) => {
        const s = suppliers.find((x) => x.id === p.supplierId)!
        return <PrimaryCell initials={s.initials} title={s.name} subtitle={s.kind} />
      },
    },
    { key: 'item', header: 'Item', render: (p) => <TextCell>{p.item}</TextCell> },
    { key: 'qty', header: 'Qty', align: 'right', width: 120, render: (p) => <NumberCell>{formatQty(p)}</NumberCell> },
    { key: 'total', header: 'Total', align: 'right', width: 116, render: (p) => <NumberCell>{formatNaira(totalOf(p))}</NumberCell> },
    { key: 'paid', header: 'Paid', align: 'right', width: 116, render: (p) => <NumberCell>{formatNaira(purchasePaid(p.ref))}</NumberCell> },
    {
      key: 'status',
      header: 'Status',
      width: 150,
      render: (p) => {
        const s = purchaseStatus(p, purchasePaid(p.ref))
        return (
          <Badge dot tone={s.tone}>
            {s.label}
          </Badge>
        )
      },
    },
  ]

  return (
    <Table
      columns={columns}
      rows={purchases}
      rowKey={(p) => p.ref}
      onRowClick={onOpen}
      actionsWidth={56}
      rowActions={(p) => (
        <RowMenu
          items={[
            { label: 'View details', onSelect: () => onOpen(p) },
            { label: 'Record a payment', onSelect: () => onPay(p), disabled: totalOf(p) <= purchasePaid(p.ref) },
            { label: 'Download PDF', onSelect: () => toast(`${p.ref} downloaded`) },
          ]}
        />
      )}
    />
  )
}
