'use client'

import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toastContext'
import { farmSettings } from '../../data/farmSettings'
import { weekdayDm } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canApprove } from '../../lib/access'
import { formatNumber } from '../../lib/format'

type Only = 'feed' | 'medication' | 'eggs'

/**
 * Count differences too big to apply straight away. They don't change stock until the owner or farm
 * manager approves them. Hidden when there are none, or for anyone who can't decide.
 */
export function PendingCounts({ only }: { only?: Only }) {
  const user = useCurrentUser()
  const toast = useToast()
  const { history, catalog, decideCount } = useTrade()
  const [busy, setBusy] = useState<number | null>(null)
  if (!canApprove(user.role)) return null

  const rows = history.pendingCounts.filter((a) => !only || (only === 'eggs' ? a.item === 'eggs' || a.item === 'cracked_eggs' : a.item === only))
  if (!rows.length) return null

  const describe = (a: (typeof rows)[number]) => {
    if (a.item === 'feed') return { name: catalog.feedTypes.find((f) => f.id === a.feed_type_id)?.name ?? 'Feed', fmt: (n: number) => `${formatNumber(n)} ${Math.abs(n) === 1 ? 'bag' : 'bags'}` }
    if (a.item === 'medication') {
      const m = catalog.medications.find((x) => x.id === a.medication_id)
      return { name: m?.name ?? 'Medication', fmt: (n: number) => `${formatNumber(n)} ${m?.stock_unit ?? ''}`.trim() }
    }
    const crates = (n: number) => `${formatNumber(Math.round((n / farmSettings.eggsPerCrate) * 10) / 10)} crates`
    return { name: a.item === 'eggs' ? 'Eggs' : 'Cracked eggs', fmt: crates }
  }

  const decide = async (id: number, approve: boolean, name: string) => {
    setBusy(id)
    const ok = await decideCount(id, approve)
    setBusy(null)
    if (ok) toast(approve ? `${name} count applied to stock` : `${name} count rejected — stock unchanged`)
  }

  return (
    <Card>
      <CardHeader
        title="Counts waiting for you"
        info="Differences bigger than the count limit don't change stock until a manager approves them. Approve to apply the difference; reject to keep the stock as it was."
        meta={<span className="type-body-sm text-fg-tertiary">{rows.length} to decide</span>}
      />
      <ul className="flex flex-col px-5 pb-4">
        {rows.map((a) => {
          const { name, fmt } = describe(a)
          const diff = Number(a.quantity_change)
          const who = catalog.profiles.find((p) => p.id === a.recorded_by)?.full_name.split(' ')[0] ?? '—'
          const reason = catalog.reasons.find((r) => r.id === a.reason_id)?.name ?? '—'
          return (
            <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-subtle py-3 last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-label-md text-fg-primary">
                  {name} · {diff > 0 ? '+' : '−'}
                  {fmt(Math.abs(diff))}
                </span>
                <span className="type-body-sm text-fg-secondary">
                  {a.counted_quantity !== null ? `Counted ${fmt(Number(a.counted_quantity))} · ` : ''}
                  {reason}
                  {a.note ? ` · ${a.note}` : ''} · {who}, {weekdayDm(a.adjusted_on)}
                </span>
              </span>
              <span className="flex gap-2">
                <Button size="sm" disabled={busy === a.id} onClick={() => void decide(a.id, false, name)}>
                  Reject
                </Button>
                <Button size="sm" variant="primary" disabled={busy === a.id} onClick={() => void decide(a.id, true, name)}>
                  Approve
                </Button>
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
