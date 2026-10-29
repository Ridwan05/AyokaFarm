import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { explain } from '../../data/explain'
import { penName } from '../../data/farmViews'
import { weekdayDayMonth } from '../../data/metrics'
import { birdsOnRecord } from '../../data/penView'
import type { History } from '../../data/remote'
import { farmTodayISO } from '../../data/session'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { CLOSE_REASONS, saveFlock } from './saveFlock'

type Props = { flock: History['flocks'][number]; onClose: () => void }

/** Owner only: end a flock so its pen is empty and ready for the next placement. */
export function CloseFlockDrawer({ flock, onClose }: Props) {
  const router = useRouter()
  const toast = useToast()
  const { history, catalog, reload } = useTrade()
  const today = farmTodayISO()
  const lastEntry = history.daily.filter((d) => d.flockId === flock.id).reduce((m, d) => (d.date > m ? d.date : m), flock.placed_on)
  const [date, setDate] = useState(today < lastEntry ? lastEntry : today)
  const [reason, setReason] = useState<string>('sold_out')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const birds = birdsOnRecord(history, flock)
  const pen = penName(catalog, flock.pen_id)
  const error = !date ? 'Pick a date' : date < lastEntry ? `Entries go up to ${weekdayDayMonth(lastEntry)}` : date > today ? 'That’s in the future' : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (error) return
    setBusy(true)
    const ok = await saveFlock(flock.id, { status: 'closed', closed_on: date, close_reason: reason, close_note: note.trim() || null })
    if (ok) await reload()
    setBusy(false)
    if (!ok) return
    toast(`${pen} is empty and ready for a new flock`)
    onClose()
    router.push('/pens')
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Close flock ${flock.code}`}
      subtitle={`${pen} · placed ${weekdayDayMonth(flock.placed_on)}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="danger" className="flex-1" type="submit" form="close-flock" disabled={busy || Boolean(error)}>
            {busy ? 'Closing…' : 'Close flock'}
          </Button>
        </>
      }
    >
      <form id="close-flock" onSubmit={submit} className="flex flex-col gap-5">
        <SummaryBox>
          <KeyValueRow label="Birds still on record" strong calculated={explain.closeFlockBirds()}>
            {formatNumber(birds)}
          </KeyValueRow>
        </SummaryBox>
        {birds > 0 && (
          <Alert tone="warning" title={`${formatNumber(birds)} birds are still counted in ${pen}`}>
            Record where they went first so the flock closes at zero: a bird sale split to {pen}, or the final deaths in today’s entry. You can still close
            it now.
            <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <AlertAction onClick={() => router.push('/sales')}>Record a bird sale</AlertAction>
              <AlertAction onClick={() => router.push(`/production/entry/${flock.pen_id}`)}>Record final deaths</AlertAction>
            </span>
          </Alert>
        )}
        <Field label="Closing date" hint={`On or after the last entry (${weekdayDayMonth(lastEntry)})`} error={error}>
          {(id) => <DateInput id={id} value={date} min={lastEntry} max={today} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Reason">
          {(id) => <SelectInput id={id} value={reason} onChange={(e) => setReason(e.target.value)} options={CLOSE_REASONS.map((r) => ({ value: r.value, label: r.label }))} />}
        </Field>
        <Field label="Note" hint="Optional, e.g. who bought the birds">
          {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <p className="type-body-sm text-fg-tertiary">
          The flock’s records stay in reports and the Closed flocks table. {pen} becomes empty and can take a new flock. Only the owner can close or re-open
          a flock.
        </p>
      </form>
    </Drawer>
  )
}
