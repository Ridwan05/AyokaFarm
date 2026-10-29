import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Drawer } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import type { History } from '../../data/remote'
import { useTrade, type FlockPatch } from '../../data/tradeContext'
import { batchChoices, num, rowsFromPlacements, sourceError, toBirdSources, type SourceRow } from './birdSourceRules'
import { BirdSources } from './BirdSources'

type Props = { flock: History['flocks'][number]; onClose: () => void }

/** Owner only: correct a flock's details and where its first-day birds came from. */
export function EditFlockDrawer({ flock, onClose }: Props) {
  const toast = useToast()
  const { history, catalog, updateFlock, setFlockSources } = useTrade()
  const hasEntries = history.daily.some((d) => d.flockId === flock.id)
  const firstDay = history.placements.filter((p) => p.flock_id === flock.id && p.placed_on === flock.placed_on)
  const startRows = rowsFromPlacements(firstDay)

  const [code, setCode] = useState(flock.code)
  const [breed, setBreed] = useState(flock.breed ?? '')
  const [notes, setNotes] = useState(flock.notes ?? '')
  const [ageDays, setAgeDays] = useState(String(flock.age_at_placement_days))
  const [placedOn, setPlacedOn] = useState(flock.placed_on)
  const [birdTypeId, setBirdTypeId] = useState(flock.bird_type_id)
  const [rows, setRows] = useState<SourceRow[]>(startRows)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  // Birds now placed from a batch are available again while editing.
  const credit = new Map<number, number>()
  for (const p of firstDay) if (p.purchase_id !== null) credit.set(p.purchase_id, (credit.get(p.purchase_id) ?? 0) + p.birds)
  const choices = batchChoices(catalog, birdTypeId, birdTypeId === flock.bird_type_id ? credit : undefined)
  const sourcesChanged = JSON.stringify(rows) !== JSON.stringify(startRows) || birdTypeId !== flock.bird_type_id
  const problem = sourcesChanged ? sourceError(rows, choices) : ''
  const errors = { code: code.trim() ? undefined : 'Give the flock a code', age: num(ageDays) >= 0 ? undefined : 'Enter an age in days' }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.code || errors.age || problem) return
    const patch: FlockPatch = {}
    if (code.trim() !== flock.code) patch.code = code.trim()
    if ((breed.trim() || null) !== flock.breed) patch.breed = breed.trim() || null
    if ((notes.trim() || null) !== flock.notes) patch.notes = notes.trim() || null
    if (Math.round(num(ageDays)) !== flock.age_at_placement_days) patch.age_at_placement_days = Math.round(num(ageDays))
    if (placedOn !== flock.placed_on) patch.placed_on = placedOn
    if (birdTypeId !== flock.bird_type_id) patch.bird_type_id = birdTypeId
    setBusy(true)
    let ok = true
    if (Object.keys(patch).length) ok = await updateFlock(flock.id, patch)
    // Birds are replaced after the details, so a new bird type or date applies to them.
    if (ok && sourcesChanged) ok = await setFlockSources(flock.id, toBirdSources(rows))
    setBusy(false)
    if (!ok) return
    toast(`Flock ${code.trim()} saved`)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Edit flock ${flock.code}`}
      subtitle="Only the owner can change flock details"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="edit-flock" disabled={busy}>
            {busy ? 'Saving…' : 'Save flock'}
          </Button>
        </>
      }
    >
      <form id="edit-flock" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex gap-3">
          <Field label="Flock code" className="flex-1" error={submitted ? errors.code : undefined}>
            {(id) => <TextInput id={id} value={code} onChange={(e) => setCode(e.target.value)} />}
          </Field>
          <Field label="Breed" className="flex-1">
            {(id) => <TextInput id={id} value={breed} onChange={(e) => setBreed(e.target.value)} />}
          </Field>
        </div>
        <Field label="Bird type" hint={hasEntries ? 'Locked: the flock has daily entries' : undefined}>
          {(id) => (
            <SelectInput
              id={id}
              disabled={hasEntries}
              value={String(birdTypeId)}
              onChange={(e) => {
                setBirdTypeId(Number(e.target.value))
                setRows([])
              }}
              options={catalog.birdTypes.map((b) => ({ value: String(b.id), label: b.name }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label="Placed on" className="flex-1" hint={hasEntries ? 'Locked: the flock has daily entries' : 'Day 1 of the flock'}>
            {(id) => <DateInput id={id} value={placedOn} disabled={hasEntries} onChange={(e) => setPlacedOn(e.target.value)} />}
          </Field>
          <Field label="Age at placement" className="flex-1" hint="0 for day-old chicks" error={submitted ? errors.age : undefined}>
            {(id) => <TextInput id={id} inputMode="numeric" suffix="days" value={ageDays} onChange={(e) => setAgeDays(e.target.value)} />}
          </Field>
        </div>
        <section aria-label="Birds placed" className="flex flex-col gap-2">
          <span className="type-label-md text-fg-primary">Birds placed on day 1</span>
          <BirdSources choices={choices} rows={rows} onChange={setRows} allowNoPurchase showErrors={submitted} />
          {problem && (submitted || sourcesChanged) && <p className="type-body-sm text-fg-danger">{problem}</p>}
          <p className="type-body-sm text-fg-tertiary">Changing these changes birds placed and every later day’s bird count. Birds added later are kept.</p>
        </section>
        <Field label="Notes">
          {(id) => <TextInput id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </form>
    </Drawer>
  )
}
