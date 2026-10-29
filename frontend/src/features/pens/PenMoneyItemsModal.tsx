import { Download } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Overlay'
import { dayMonth, weekdayDm, type MoneyItem } from '../../data/metrics'
import { downloadCsv } from '../../lib/export'
import { formatNaira } from '../../lib/format'

type Props = {
  /** "Sales", "Feed" or "Pen expenses". */
  title: string
  penName: string
  range: { from: string; to: string; label: string }
  items: MoneyItem[]
  /** What it adds up to; matches the figure on the Costs & profit card. */
  total: number
  /** One line under the list saying how the items are counted. */
  note: string
  onClose: () => void
}

/** The items behind one figure on a pen's Costs & profit card. */
export function PenMoneyItemsModal({ title, penName, range, items, total, note, onClose }: Props) {
  const exportCsv = () =>
    downloadCsv(
      `${penName}-${title}-${range.from}-${range.to}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      ['Date', 'Item', 'Detail', 'Amount (₦)'],
      items.map((i) => [i.date, i.title, i.detail, Math.round(i.amount)]),
    )

  return (
    <Modal
      open
      onClose={onClose}
      title={`${title} · ${penName}`}
      subtitle={`${range.label} · ${dayMonth(range.from)} – ${dayMonth(range.to)} · ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
      footer={
        <>
          <Button size="lg" className="flex-1" leadingIcon={Download} disabled={!items.length} onClick={exportCsv}>
            Export
          </Button>
          <Button size="lg" variant="primary" className="flex-1" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {items.length ? (
        <ul className="flex flex-col">
          {items.map((i) => (
            <li key={i.key} className="flex items-start gap-3 border-b border-line-subtle py-3 last:border-b-0">
              <span className="w-[72px] shrink-0 pt-0.5 type-body-sm text-fg-tertiary">{weekdayDm(i.date)}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate type-label-md text-fg-primary">{i.title}</span>
                <span className="type-body-sm text-fg-secondary">{i.detail}</span>
              </span>
              <span className="shrink-0 type-label-md whitespace-nowrap text-fg-primary">{formatNaira(Math.round(i.amount))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center type-body-md text-fg-tertiary">Nothing for this pen in this period.</p>
      )}
      <div className="mt-2 flex items-center border-t border-line pt-3">
        <span className="flex-1 type-label-md text-fg-primary">Total</span>
        <span className="type-h3 text-fg-primary">{formatNaira(Math.round(total))}</span>
      </div>
      <p className="pt-2 type-body-sm text-fg-tertiary">{note}</p>
    </Modal>
  )
}
