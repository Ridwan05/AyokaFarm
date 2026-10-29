import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { DetailSection, History } from '../../components/ui/Detail'
import { explainMoney } from '../../data/explainMoney'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import type { Expense } from '../../data/expenses'
import { pens } from '../../data/pens'
import { suppliers } from '../../data/suppliers'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { canEditRecord, canVoidRecord } from '../records/recordRules'
import { dayMonth } from '../purchases/purchaseView'

const naira = (n: number) => `₦${formatNumber(n)}`

export function ExpenseDrawer({ expense: e, onClose, onEdit, onVoid }: { expense: Expense; onClose: () => void; onEdit?: () => void; onVoid?: () => void }) {
  const user = useCurrentUser()
  const { history, receiptUrl } = useTrade()
  const row = history.expenses.find((x) => x.ref === e.id)
  const mayEdit = Boolean(onEdit) && canEditRecord(user, 'expenses', row)
  const mayVoid = Boolean(onVoid) && canVoidRecord(user, 'expenses')
  const [opening, setOpening] = useState(false)
  const unpaid = e.amount - (e.amountPaid ?? e.amount)
  const viewReceipt = async () => {
    if (!e.receiptPath) return
    setOpening(true)
    // Open the tab now (pop-up blockers), then point it at the signed link.
    const tab = window.open('', '_blank')
    const url = await receiptUrl(e.receiptPath)
    setOpening(false)
    if (url && tab) tab.location.href = url
    else tab?.close()
  }
  const supplier = suppliers.find((s) => s.id === e.supplierId)
  const totalBirds = pens.reduce((n, p) => n + p.liveBirds, 0)
  const byPen = [...pens].sort((a, b) => a.id - b.id)

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${e.category} · ${naira(e.amount)}`}
      subtitle={`${dayMonth(e.date)}/${e.date.slice(0, 4)} · added by ${e.addedBy}`}
      footer={
        <>
          {mayEdit && (
            <Button size="lg" className="flex-1" onClick={onEdit}>
              Correct expense
            </Button>
          )}
          <Button size="lg" variant="primary" className="flex-1" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <DetailSection title="Expense">
        <KeyValueRow label="What for">{e.description}</KeyValueRow>
        <KeyValueRow label="Paid">
          {naira(e.amountPaid ?? e.amount)} · {e.method}
        </KeyValueRow>
        {unpaid > 0 && <KeyValueRow label="Owed to the supplier">{naira(unpaid)}</KeyValueRow>}
        <KeyValueRow label="Supplier">{supplier?.name ?? '—'}</KeyValueRow>
        <KeyValueRow label="Receipt">
          {e.receiptPath ? (
            <button type="button" className="cursor-pointer text-fg-brand underline underline-offset-4" onClick={() => void viewReceipt()} disabled={opening}>
              {opening ? 'Opening…' : 'View receipt'}
            </button>
          ) : (
            'None'
          )}
        </KeyValueRow>
      </DetailSection>

      {e.pen !== null ? (
        <DetailSection title="Charged to one pen">
          <KeyValueRow label={`Pen ${e.pen}`} calculated={explainMoney.wholeToPen()}>
            {naira(e.amount)} · all of it
          </KeyValueRow>
          <KeyValueRow label="Other pens" calculated={explainMoney.wholeToPen()}>
            ₦0
          </KeyValueRow>
        </DetailSection>
      ) : (
        <DetailSection title="Shared by birds in each pen">
          {byPen.map((p) => (
            <KeyValueRow key={p.id} label={`Pen ${p.id}`} calculated={explainMoney.splitByBirds()}>
              {naira(Math.round((e.amount * p.liveBirds) / totalBirds))}
            </KeyValueRow>
          ))}
        </DetailSection>
      )}

      {mayVoid && (
        <div className="py-2">
          <Button size="sm" variant="ghost" className="text-fg-danger" onClick={onVoid}>
            Void expense…
          </Button>
        </div>
      )}

      <History events={[{ title: 'Added', detail: `By ${e.addedBy}`, time: dayMonth(e.date) }]} />
    </Drawer>
  )
}
