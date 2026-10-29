'use client'

import { Bird, ChevronRight, Egg, PenLine, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Presence } from '../components/ui/Overlay'
import { pensToday } from '../data/dashboard'
import { pens } from '../data/pens'
import { withTodaysRecord } from '../data/production'
import { farm } from '../data/session'
import { useCurrentUser } from '../data/sessionContext'
import { TODAY_ISO } from '../data/ledger'
import { useTrade } from '../data/tradeContext'
import { AddExpenseModal } from '../features/expenses/AddExpenseModal'
import { canSeePen } from '../lib/access'
import { cn } from '../lib/cn'
import { formatLongDate, formatNaira, formatNumber, formatSignedPct, greeting } from '../lib/format'
import { farmSettings } from '../data/farmSettings'
import { penName } from '../data/farmViews'

/** P-M1 · A pen attendant's home: their pens, and what still needs recording today. */
export default function PenAttendantHome() {
  const user = useCurrentUser()
  const { productionRecords, expenses, catalog } = useTrade()
  const [addingExpense, setAddingExpense] = useState(false)
  const mine = pensToday.filter((p) => canSeePen(user, p.id)).map((p) => withTodaysRecord(p, productionRecords))
  const due = mine.filter((p) => p.died === null)
  // Read the clock once, not on every render.
  const [hello] = useState(() => greeting(new Date()))
  const firstName = user.name.split(' ')[0]
  const myExpenses = expenses.filter((e) => e.addedBy === firstName && e.date === TODAY_ISO)

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(farm.today)}
        title={`${hello}, ${firstName}`}
        description={
          due.length
            ? `${due.length} of your ${mine.length === 1 ? 'pen needs' : `${mine.length} pens need`} today’s entry — due by ${farmSettings.missingEntryCutoff}.`
            : 'All your pens are recorded for today. Thank you.'
        }
        actions={
          <Button leadingIcon={Wallet} onClick={() => setAddingExpense(true)}>
            Add expense
          </Button>
        }
      />

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {mine.map((p) => {
          const pen = pens.find((x) => x.id === p.id)!
          const Icon = pen.type === 'Layers' ? Egg : Bird
          const recorded = p.died !== null
          return (
            <li key={p.id} className="flex flex-col rounded-xl border border-line bg-surface">
              <Link
                href={`/pens/${p.id}`}
                className="flex items-center gap-3 rounded-t-xl px-4 pt-4 pb-3 transition-colors duration-150 hover:bg-canvas"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-icon-brand">
                  <Icon size={20} strokeWidth={1.5} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-h3 text-fg-primary">{p.name}</span>
                  <span className="truncate type-body-sm text-fg-tertiary">
                    {p.flock} · {formatNumber(p.birds)} birds
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={1.5} className="text-icon-secondary" />
              </Link>

              <div className="flex items-center gap-2 px-4">
                <Badge dot tone={p.entry.tone}>
                  {p.entry.label}
                </Badge>
              </div>

              {recorded ? (
                <dl className="grid grid-cols-3 gap-2 px-4 pt-3 pb-4">
                  <Stat label="Died" value={String(p.died)} />
                  <Stat
                    label="Feed vs exp."
                    value={p.feedVsExpected === null ? '—' : formatSignedPct(p.feedVsExpected)}
                    warn={p.feedVsExpected !== null && Math.abs(p.feedVsExpected) > farmSettings.feedVariancePct}
                  />
                  <Stat label="Laying" value={p.layingRate === null ? '—' : `${p.layingRate.toFixed(1)}%`} />
                </dl>
              ) : (
                <div className="px-4 pt-3 pb-4">
                  <Link
                    href={`/production/entry/${p.id}`}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand type-label-lg text-fg-on-brand shadow-xs transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-brand-hover motion-safe:active:scale-[0.97]"
                  >
                    <PenLine size={20} strokeWidth={1.5} />
                    Record today
                  </Link>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {myExpenses.length > 0 && (
        <Card>
          <CardHeader title="Expenses you added today" meta={<span className="type-body-sm text-fg-tertiary">The farm manager sees these in Expenses</span>} />
          <ul className="flex flex-col px-5 pb-3">
            {myExpenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-b border-line-subtle py-2.5 last:border-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-label-md text-fg-primary">{e.description}</span>
                  <span className="type-body-sm text-fg-tertiary">
                    {e.category} · {e.pen === null ? 'Whole farm' : penName(catalog, e.pen)}
                  </span>
                </span>
                <span className="type-numeric-md text-fg-primary">{formatNaira(e.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Presence>{addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}</Presence>
    </>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="type-body-sm text-fg-tertiary">{label}</dt>
      <dd className={cn('type-numeric-md', warn ? 'text-fg-warning' : 'text-fg-primary')}>{value}</dd>
    </div>
  )
}
