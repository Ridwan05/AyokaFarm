import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { useTrade } from '../../data/tradeContext'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { oldestDays } from './customerView'

export function SendStatementsModal({ onClose }: { onClose: () => void }) {
  const { customers, customerBalance, customerOpenBills, sales } = useTrade()
  const toast = useToast()
  const owing = customers
    .map((c) => ({ c, balance: customerBalance(c.id), bills: customerOpenBills(c.id), pending: sales.some((s) => s.customerId === c.id && s.pendingApproval) }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance)
  const optedIn = owing.filter((x) => x.c.whatsapp)
  const noConsent = owing.filter((x) => !x.c.whatsapp)
  const [selected, setSelected] = useState(() => new Set(optedIn.map((x) => x.c.id)))
  const first = optedIn.find((x) => selected.has(x.c.id))

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Modal
      open
      onClose={onClose}
      title="Send statements on WhatsApp"
      subtitle="Each customer gets their running balance as a PDF · Fri 09 Oct"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            className="flex-1"
            disabled={selected.size === 0}
            onClick={() => {
              toast(`${selected.size} statements sent on WhatsApp`)
              onClose()
            }}
          >
            Send {selected.size} statements
          </Button>
        </>
      }
    >
      <div className="-mt-1 flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
        <section>
          <p className="pb-1 type-overline text-fg-tertiary">Will receive · {optedIn.length} opted in</p>
          {optedIn.map((x, i) => (
            <label key={x.c.id} className={cn('flex cursor-pointer items-center gap-3 py-2.5', i < optedIn.length - 1 && 'border-b border-line-subtle')}>
              <input type="checkbox" checked={selected.has(x.c.id)} onChange={() => toggle(x.c.id)} className="size-5 accent-[var(--ayk-color-bg-brand)]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-label-md text-fg-primary">{x.c.name}</span>
                <span className="type-body-sm text-fg-tertiary">
                  {x.pending ? '1 sale still waiting for approval' : `Oldest bill ${oldestDays(x.bills)} day${oldestDays(x.bills) === 1 ? '' : 's'}`}
                </span>
              </span>
              <span className="type-numeric-md text-fg-primary">₦{formatNumber(x.balance)}</span>
            </label>
          ))}
        </section>
        {noConsent.length > 0 && (
          <section>
            <p className="pb-1 type-overline text-fg-tertiary">No WhatsApp consent · {noConsent.length}</p>
            {noConsent.map((x, i) => (
              <div key={x.c.id} className={cn('flex items-center gap-3 py-2.5', i < noConsent.length - 1 && 'border-b border-line-subtle')}>
                <input type="checkbox" disabled className="size-5" aria-label={`${x.c.name} has not agreed to WhatsApp`} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-label-md text-fg-secondary">{x.c.name}</span>
                  <span className="type-body-sm text-fg-tertiary">Print or hand over a PDF instead</span>
                </span>
                <span className="type-numeric-md text-fg-secondary">₦{formatNumber(x.balance)}</span>
                <button type="button" onClick={() => toast(`${x.c.short} statement ready to print`)} className="cursor-pointer type-label-md text-fg-brand underline underline-offset-2">
                  Print
                </button>
              </div>
            ))}
          </section>
        )}
        {first && (
          <div className="rounded-lg bg-subtle px-3 py-3">
            <p className="type-overline text-fg-tertiary">Message preview</p>
            <p className="type-body-md text-fg-primary">
              Good afternoon, {first.c.short}. Here is your AyokaFarm statement to 09 Oct. Balance owed: ₦{formatNumber(first.balance)}. Thank you — AyokaFarm.
            </p>
            <p className="type-body-sm text-fg-tertiary">PDF attached · statement 01 Jul – 09 Oct 2026</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
