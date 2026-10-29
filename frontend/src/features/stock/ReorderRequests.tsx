import { Check, Plus, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toastContext'
import { dayMonth } from '../../data/metrics'
import { useReorderRequests } from '../../data/reorders'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

type Props = {
  /** Buyers can mark requests ordered or dismiss them; the store keeper only sees what's waiting. */
  canDecide: boolean
  /** Opens the new-purchase form (buyers). */
  onRecordPurchase?: () => void
}

/** Open "Ask to reorder" requests. Hidden when there are none. */
export function ReorderRequests({ canDecide, onRecordPurchase }: Props) {
  const toast = useToast()
  const { catalog } = useTrade()
  const { open, error, decide } = useReorderRequests()
  if (error) return <p className="type-body-sm text-fg-warning">{error}</p>
  if (!open.length) return null

  const itemName = (r: (typeof open)[number]) =>
    r.feed_type_id ? (catalog.feedTypes.find((f) => f.id === r.feed_type_id)?.name ?? 'Feed') : (catalog.medications.find((m) => m.id === r.medication_id)?.name ?? 'Medication')
  const who = (id: string) => catalog.profiles.find((p) => p.id === id)?.full_name.split(' ')[0] ?? 'Someone'
  const settle = async (id: number, status: 'ordered' | 'dismissed') => {
    const problem = await decide(id, status)
    toast(problem ?? (status === 'ordered' ? 'Marked as ordered' : 'Request dismissed'))
  }

  return (
    <Card>
      <CardHeader
        title={canDecide ? 'Asked to reorder' : 'Waiting to be ordered'}
        meta={<span className="type-body-sm text-fg-tertiary">{open.length} open</span>}
        action={canDecide && onRecordPurchase ? { label: 'New purchase', onClick: onRecordPurchase } : undefined}
      />
      <ul className="flex flex-col px-5 pb-4">
        {open.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-subtle py-3 last:border-b-0">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="type-label-md text-fg-primary">
                {formatNumber(Number(r.quantity))} {r.unit} · {itemName(r)}
              </span>
              <span className="type-body-sm text-fg-secondary">
                Asked by {who(r.requested_by)} · {dayMonth(r.created_at.slice(0, 10))}
                {r.needed_by ? ` · needed by ${dayMonth(r.needed_by)}` : ''}
                {r.note ? ` · “${r.note}”` : ''}
              </span>
            </span>
            {canDecide && (
              <span className="flex gap-2">
                {onRecordPurchase && (
                  <Button size="sm" leadingIcon={Plus} onClick={onRecordPurchase}>
                    Record purchase
                  </Button>
                )}
                <Button size="sm" variant="primary" leadingIcon={Check} onClick={() => void settle(r.id, 'ordered')}>
                  Mark ordered
                </Button>
                <Button size="sm" variant="ghost" leadingIcon={X} onClick={() => void settle(r.id, 'dismissed')}>
                  Dismiss
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
