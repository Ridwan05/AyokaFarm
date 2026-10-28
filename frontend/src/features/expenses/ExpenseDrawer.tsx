import { Button } from '../../components/ui/Button'
import { DetailSection, History } from '../../components/ui/Detail'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import type { Expense } from '../../data/expenses'
import { pens } from '../../data/pens'
import { suppliers } from '../../data/suppliers'
import { formatNumber } from '../../lib/format'
import { dayMonth } from '../purchases/purchaseView'

const naira = (n: number) => `₦${formatNumber(n)}`

export function ExpenseDrawer({ expense: e, onClose }: { expense: Expense; onClose: () => void }) {
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
          <Button size="lg" className="flex-1">
            Edit expense
          </Button>
          <Button size="lg" variant="primary" className="flex-1" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <DetailSection title="Expense">
        <KeyValueRow label="What for">{e.description}</KeyValueRow>
        <KeyValueRow label="Paid">
          {naira(e.amount)} · {e.method}
        </KeyValueRow>
        <KeyValueRow label="Supplier">{supplier?.name ?? '—'}</KeyValueRow>
        <KeyValueRow label="Receipt">{e.receipt ? 'Photo attached' : 'None'}</KeyValueRow>
      </DetailSection>

      {e.pen !== null ? (
        <DetailSection title="Charged to one pen">
          <KeyValueRow label={`Pen ${e.pen}`} calculated>
            {naira(e.amount)} · all of it
          </KeyValueRow>
          <KeyValueRow label="Other pens" calculated>
            ₦0
          </KeyValueRow>
        </DetailSection>
      ) : (
        <DetailSection title="Shared by bird-days">
          {byPen.map((p) => (
            <KeyValueRow key={p.id} label={`Pen ${p.id}`} calculated>
              {naira(Math.round((e.amount * p.liveBirds) / totalBirds))}
            </KeyValueRow>
          ))}
        </DetailSection>
      )}

      <History events={[{ title: 'Added', detail: `By ${e.addedBy}`, time: dayMonth(e.date) }]} />
    </Drawer>
  )
}
