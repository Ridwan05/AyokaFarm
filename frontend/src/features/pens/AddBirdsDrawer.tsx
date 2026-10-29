import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { DateInput, Field } from '../../components/ui/Form'
import { Drawer } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import type { History } from '../../data/remote'
import { farmTodayISO } from '../../data/session'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { batchChoices, sourceError, sourceTotals, toBirdSources, type SourceRow } from './birdSourceRules'
import { BirdSources } from './BirdSources'

type Props = { flock: History['flocks'][number]; onClose: () => void }

/** Top up a flock after placement with birds from bird stock (owner and farm manager). */
export function AddBirdsDrawer({ flock, onClose }: Props) {
  const toast = useToast()
  const router = useRouter()
  const user = useCurrentUser()
  const { catalog, addBirdsToFlock } = useTrade()
  const owner = user.role === 'owner'
  const today = farmTodayISO()
  const choices = batchChoices(catalog, flock.bird_type_id)
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState<SourceRow[]>(choices[0] ? [{ kind: 'stock', purchaseId: choices[0].purchaseId, birds: '' }] : [])
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const totals = sourceTotals(rows, choices)
  const problem = sourceError(rows, choices)
  const dateError = !date ? 'Pick a date' : date <= flock.placed_on ? 'Must be after the flock was placed' : date > today ? 'That’s in the future' : undefined
  const noStock = choices.length === 0 && !owner

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (problem || dateError) return
    setBusy(true)
    const ok = await addBirdsToFlock(flock.id, date, toBirdSources(rows))
    setBusy(false)
    if (!ok) return
    toast(`${formatNumber(totals.birds)} birds added to ${flock.code}`)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Add birds to ${flock.code}`}
      subtitle="They join the flock’s count from the day you choose"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-birds" disabled={busy || noStock}>
            {busy ? 'Saving…' : 'Add birds'}
          </Button>
        </>
      }
    >
      <form id="add-birds" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Date added" error={submitted ? dateError : undefined}>
          {(id) => <DateInput id={id} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <section aria-label="Birds added" className="flex flex-col gap-2">
          <span className="type-label-md text-fg-primary">From bird stock</span>
          {noStock ? (
            <Alert tone="warning" title="No birds of this type in stock" action={<AlertAction onClick={() => router.push('/purchases')}>Record a bird purchase</AlertAction>}>
              Birds go into bird stock when their purchase is recorded.
            </Alert>
          ) : (
            <>
              <BirdSources choices={choices} rows={rows} onChange={setRows} allowNoPurchase={owner} showErrors={submitted} />
              {submitted && problem && <p className="type-body-sm text-fg-danger">{problem}</p>}
            </>
          )}
        </section>
      </form>
    </Drawer>
  )
}
