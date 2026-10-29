import { Badge } from '../../components/ui/Badge'
import { RowMenu } from '../../components/ui/Menu'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { totalOf, type Purchase } from '../../data/purchases'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canEditRecord, canVoidRecord } from '../records/recordRules'
import { formatNaira } from '../../lib/format'
import { dayMonth, formatQty, purchaseStatus } from './purchaseView'

type Props = {
  purchases: Purchase[]
  onOpen: (p: Purchase) => void
  onPay: (p: Purchase) => void
  onEdit?: (p: Purchase) => void
  onVoid?: (p: Purchase) => void
}

export function PurchasesTable({ purchases, onOpen, onPay, onEdit, onVoid }: Props) {
  const { suppliers, purchasePaid, history } = useTrade()
  const user = useCurrentUser()

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
            { label: 'Supplier statement (PDF)', onSelect: () => window.open(`/print/statement/supplier/${p.supplierId}`, '_blank') },
            ...(onEdit && canEditRecord(user, 'purchases', history.purchases.find((x) => x.ref === p.ref)) ? [{ label: 'Correct purchase…', onSelect: () => onEdit(p) }] : []),
            ...(onVoid && canVoidRecord(user, 'purchases') ? [{ label: 'Void purchase…', danger: true, onSelect: () => onVoid(p) }] : []),
          ]}
        />
      )}
    />
  )
}
