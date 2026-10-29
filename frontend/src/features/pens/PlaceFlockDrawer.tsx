import { Bird } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { pens, type FlockKind } from '../../data/pens'
import type { Catalog, History } from '../../data/remote'
import { farmTodayISO } from '../../data/session'
import { useTrade } from '../../data/tradeContext'
import { formatNumber, formatShortDate, parseISODate } from '../../lib/format'

type Props = { open: boolean; onClose: () => void }

const KINDS = ['Broilers', 'Layers', 'Point-of-lay'] as const
/** Point-of-lay pullets arrive at about 18 weeks. */
const AGE_AT_PLACEMENT: Record<FlockKind, number> = { Broilers: 0, Layers: 0, 'Point-of-lay': 126 }
const BREED: Record<FlockKind, string> = { Broilers: 'Ross 308', Layers: 'Isa Brown', 'Point-of-lay': 'Isa Brown' }

/** Next code in the farm's series (B-/L- plus the highest number so far + 1), feed from the feed targets at the starting age. */
function flockDefaults(kind: FlockKind, history: History, catalog: Catalog) {
  const prefix = kind === 'Broilers' ? 'B-' : 'L-'
  const top = Math.max(0, ...history.flocks.filter((f) => f.code.startsWith(prefix)).map((f) => Number(f.code.slice(2)) || 0))
  const bird = catalog.birdTypes.find((b) => b.name === (kind === 'Broilers' ? 'Broiler' : 'Layer'))
  const week = Math.floor(AGE_AT_PLACEMENT[kind] / 7) + 1
  const band = catalog.feedTargets.find((t) => t.bird_type_id === bird?.id && week >= t.week_from && (t.week_to === null || week <= t.week_to))
  const feed = catalog.feedTypes.find((x) => x.id === band?.recommended_feed_type_id)?.name
  return {
    nextCode: top ? `${prefix}${top + 1}` : `${prefix}0001`,
    feedPlan: feed ? `${feed} from day 1` : 'No feed target set for this age',
    day1Grams: band ? Number(band.grams_per_bird_day) : 0,
    breed: BREED[kind],
  }
}

export function PlaceFlockDrawer({ open, onClose }: Props) {
  const toast = useToast()
  const { placeFlock, history, catalog } = useTrade()
  const empty = pens.filter((p) => p.flock === '—')
  const [kind, setKind] = useState<FlockKind>('Broilers')
  const [penId, setPenId] = useState(String(empty[0]?.id ?? ''))
  const [birds, setBirds] = useState('')
  const [breed, setBreed] = useState(BREED[kind])
  const [code, setCode] = useState('')
  const [date, setDate] = useState(farmTodayISO())
  const [submitted, setSubmitted] = useState(false)

  const pen = empty.find((p) => String(p.id) === penId)
  const defaults = flockDefaults(kind, history, catalog)
  const birdCount = Number(birds.replace(/,/g, '')) || 0
  const day1Kg = (birdCount * defaults.day1Grams) / 1000
  const placed = date ? parseISODate(date) : null
  const overCapacity = pen ? birdCount > pen.capacity : false
  const errors = {
    pen: pen ? undefined : 'Every pen has a flock — add a pen or close a flock first',
    birds: birdCount > 0 ? (overCapacity ? `This pen holds ${formatNumber(pen!.capacity)}` : undefined) : 'Enter how many birds',
    code: code.trim() ? undefined : 'Give the flock a code, e.g. B-2642',
  }

  const changeKind = (k: FlockKind) => {
    setKind(k)
    setBreed(BREED[k])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.pen || errors.birds || errors.code || !date) return
    const saved = await placeFlock({
      code: code.trim(),
      penId: pen!.id,
      type: kind === 'Broilers' ? 'Broilers' : 'Layers',
      breed: breed.trim(),
      placedOn: date,
      ageAtPlacementDays: AGE_AT_PLACEMENT[kind],
      birds: birdCount,
    })
    if (!saved) return
    toast(`Flock ${code.trim()} placed in Pen ${pen!.id}`)
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Place a new flock"
      subtitle={`${pen ? `Pen ${pen.id}` : 'No empty pen'} · ${kind.toLowerCase()}${placed ? ` · day 1 is ${formatShortDate(placed)}` : ''}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="place-flock">
            Place flock
          </Button>
        </>
      }
    >
      <form id="place-flock" onSubmit={submit} className="flex flex-col gap-5">
        <SegmentedControl fullWidth label="Flock type" options={KINDS} value={kind} onChange={changeKind} />
        <Field label="Pen" hint="Only empty pens are listed" error={submitted ? errors.pen : undefined}>
          {(id) => (
            <SelectInput
              id={id}
              value={penId}
              onChange={(e) => setPenId(e.target.value)}
              options={empty.map((p) => ({ value: String(p.id), label: `Pen ${p.id} · empty · holds ${formatNumber(p.capacity)}` }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label="Birds placed" className="flex-1" error={submitted || overCapacity ? errors.birds : undefined}>
            {(id) => (
              <TextInput
                id={id}
                inputMode="numeric"
                suffix="birds"
                value={birds}
                invalid={overCapacity}
                onChange={(e) => setBirds(e.target.value)}
                onBlur={() => birdCount && setBirds(formatNumber(birdCount))}
              />
            )}
          </Field>
          <Field label="Breed" className="flex-1">
            {(id) => <TextInput id={id} value={breed} onChange={(e) => setBreed(e.target.value)} />}
          </Field>
        </div>
        <Field label="Flock code" hint={`e.g. ${defaults.nextCode}`} error={submitted ? errors.code : undefined}>
          {(id) => <TextInput id={id} value={code} placeholder={defaults.nextCode} onChange={(e) => setCode(e.target.value)} />}
        </Field>
        <Field label="Placement date" hint="Day 1 of the flock">
          {(id) => <DateInput id={id} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <SummaryBox>
          <KeyValueRow label="Feed plan" calculated="The feed bands set for this bird type in Settings → Feed & targets.">
            {defaults.feedPlan}
          </KeyValueRow>
          <KeyValueRow label="Expected feed, day 1" calculated="Birds placed × grams a bird a day for their age at placement (Settings → Feed & targets).">
            {formatNumber(birdCount)} × {defaults.day1Grams} g = {formatNumber(day1Kg)} kg
          </KeyValueRow>
          <KeyValueRow label="Age at placement" calculated="Day-old chicks start at 0; point-of-lay birds arrive older, and their age counts from hatch.">
            {AGE_AT_PLACEMENT[kind] ? `${AGE_AT_PLACEMENT[kind] / 7} weeks` : 'Day-old'}
          </KeyValueRow>
          <KeyValueRow label="First entry due" strong>
            {placed ? `${formatShortDate(placed)} · ${pen?.staff ?? '—'}` : '—'}
          </KeyValueRow>
        </SummaryBox>
        <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
          <Bird size={16} strokeWidth={1.5} className="shrink-0 text-icon-brand" />
          Placing the flock opens daily entries for this pen. Record the bird purchase itself under Purchases.
        </p>
      </form>
    </Drawer>
  )
}
