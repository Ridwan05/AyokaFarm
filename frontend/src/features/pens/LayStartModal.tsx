import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { DateInput, Field } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { explain } from '../../data/explain'
import { weekdayDayMonth } from '../../data/metrics'
import type { History } from '../../data/remote'
import { farmTodayISO } from '../../data/session'
import { useTrade } from '../../data/tradeContext'
import { saveFlock } from './saveFlock'

type Props = { flock: History['flocks'][number]; suggested: string | null; onClose: () => void }

/** Set (or clear) the day a layer flock started laying. Rearing cost runs up to the day before. */
export function LayStartModal({ flock, suggested, onClose }: Props) {
  const { reload } = useTrade()
  const toast = useToast()
  const today = farmTodayISO()
  const saved = flock.laying_started_on ?? null
  const [date, setDate] = useState(saved ?? suggested ?? today)
  const [busy, setBusy] = useState(false)
  const latest = flock.closed_on ?? today
  const error = !date ? 'Pick a date' : date < flock.placed_on ? 'That’s before the flock was placed' : date > latest ? (flock.closed_on ? 'That’s after the flock was closed' : 'That’s in the future') : undefined

  const save = async (value: string | null) => {
    setBusy(true)
    const ok = await saveFlock(flock.id, { laying_started_on: value })
    if (ok) await reload()
    setBusy(false)
    if (!ok) return
    toast(value ? `${flock.code} laying since ${weekdayDayMonth(value)}` : `Start of lay cleared for ${flock.code}`)
    onClose()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!error) void save(date)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={saved ? 'Change start of lay' : 'Mark start of lay'}
      subtitle={`Flock ${flock.code} · placed ${weekdayDayMonth(flock.placed_on)}`}
      footer={
        <>
          {saved && (
            <Button size="lg" disabled={busy} onClick={() => void save(null)}>
              Clear
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="lay-start" disabled={busy || Boolean(error)}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="lay-start" onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="First laying day"
          hint={suggested ? `First eggs recorded ${weekdayDayMonth(suggested)}` : 'No eggs recorded yet'}
          error={error}
        >
          {(id) => <DateInput id={id} value={date} min={flock.placed_on} max={latest} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <p className="type-body-sm text-fg-tertiary">{explain.layStart()}</p>
      </form>
    </Modal>
  )
}
