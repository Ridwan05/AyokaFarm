import { Bird } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { pens } from '../../data/pens'
import type { Catalog, History } from '../../data/remote'
import { farmTodayISO } from '../../data/session'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber, formatShortDate, parseISODate } from '../../lib/format'
import { batchChoices, num, sourceError, sourceTotals, toBirdSources, type SourceRow } from './birdSourceRules'
import { BirdSources } from './BirdSources'

type Props = { open: boolean; onClose: () => void }

/** Next code in the farm's series (L- for layers, B- otherwise), feed from the feed targets at the starting age. */
function flockDefaults(birdTypeId: number, ageDays: number, history: History, catalog: Catalog) {
  const bird = catalog.birdTypes.find((b) => b.id === birdTypeId)
  const prefix = bird?.lays_eggs ? 'L-' : 'B-'
  const top = Math.max(0, ...history.flocks.filter((f) => f.code.startsWith(prefix)).map((f) => Number(f.code.slice(2)) || 0))
  const week = Math.floor(ageDays / 7) + 1
  const band = catalog.feedTargets.find((t) => t.bird_type_id === birdTypeId && week >= t.week_from && (t.week_to === null || week <= t.week_to))
  const feed = catalog.feedTypes.find((x) => x.id === band?.recommended_feed_type_id)?.name
  return {
    nextCode: top ? `${prefix}${top + 1}` : `${prefix}0001`,
    feedPlan: feed ? `${feed} from day 1` : 'No feed target set for this age',
    day1Grams: band ? Number(band.grams_per_bird_day) : 0,
  }
}

export function PlaceFlockDrawer({ open, onClose }: Props) {
  const toast = useToast()
  const router = useRouter()
  const user = useCurrentUser()
  const { placeFlock, history, catalog } = useTrade()
  const owner = user.role === 'owner'
  // Any active pen without a flock; the flock decides the bird type.
  const empty = catalog.pens.filter((p) => !history.flocks.some((f) => f.pen_id === p.id && f.status === 'active'))
  const withStock = catalog.birdTypes.find((b) => batchChoices(catalog, b.id).length > 0)
  const [birdTypeId, setBirdTypeId] = useState(withStock?.id ?? catalog.birdTypes[0]?.id ?? 0)
  const firstChoices = batchChoices(catalog, birdTypeId)
  const [penId, setPenId] = useState(String(empty[0]?.id ?? ''))
  const [rows, setRows] = useState<SourceRow[]>(firstChoices[0] ? [{ kind: 'stock', purchaseId: firstChoices[0].purchaseId, birds: formatNumber(firstChoices[0].left) }] : [])
  const [breed, setBreed] = useState(firstChoices[0]?.breed ?? '')
  const [ageWeeks, setAgeWeeks] = useState(firstChoices[0] ? String(Math.round(firstChoices[0].ageDays / 7)) : '0')
  const [code, setCode] = useState('')
  const [date, setDate] = useState(farmTodayISO())
  const [submitted, setSubmitted] = useState(false)

  const choices = batchChoices(catalog, birdTypeId)
  const pen = empty.find((p) => String(p.id) === penId)
  const ageDays = Math.round(num(ageWeeks) * 7)
  const defaults = flockDefaults(birdTypeId, ageDays, history, catalog)
  const totals = sourceTotals(rows, choices)
  const day1Kg = (totals.birds * defaults.day1Grams) / 1000
  const placed = date ? parseISODate(date) : null
  const overCapacity = pen ? totals.birds > pen.capacity : false
  const sourcesProblem = sourceError(rows, choices)
  const errors = {
    pen: pen ? undefined : 'Every pen has a flock — add a pen or close a flock first',
    sources: sourcesProblem || (overCapacity ? `${pen!.name} holds ${formatNumber(pen!.capacity)} birds` : undefined),
    code: code.trim() ? undefined : `Give the flock a code, e.g. ${defaults.nextCode}`,
  }
  const noStock = choices.length === 0 && !owner
  const staff = pens.find((p) => p.id === pen?.id)?.staff

  /** A new bird type starts again from its first batch in stock. */
  const changeType = (id: number) => {
    setBirdTypeId(id)
    const first = batchChoices(catalog, id)[0]
    setRows(first ? [{ kind: 'stock', purchaseId: first.purchaseId, birds: formatNumber(first.left) }] : [])
    if (first) {
      setBreed(first.breed ?? '')
      setAgeWeeks(String(Math.round(first.ageDays / 7)))
    }
  }
  /** Breed and age follow the first batch chosen, until someone types their own. */
  const changeRows = (next: SourceRow[]) => {
    const before = rows[0]?.kind === 'stock' ? rows[0].purchaseId : null
    const after = next[0]?.kind === 'stock' ? next[0].purchaseId : null
    if (after !== null && after !== before) {
      const c = choices.find((x) => x.purchaseId === after)
      if (c) {
        setBreed(c.breed ?? breed)
        setAgeWeeks(String(Math.round(c.ageDays / 7)))
      }
    }
    setRows(next)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.pen || errors.sources || errors.code || !date) return
    const saved = await placeFlock({
      code: code.trim(),
      penId: pen!.id,
      birdTypeId,
      breed: breed.trim(),
      placedOn: date,
      ageAtPlacementDays: ageDays,
      sources: toBirdSources(rows),
    })
    if (!saved) return
    toast(`Flock ${code.trim()} placed in ${pen!.name}`)
    onClose()
  }

  const birdName = catalog.birdTypes.find((b) => b.id === birdTypeId)?.name ?? 'birds'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Place a new flock"
      subtitle={`${pen ? pen.name : 'No empty pen'} · ${birdName.toLowerCase()}${placed ? ` · day 1 is ${formatShortDate(placed)}` : ''}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="place-flock" disabled={noStock}>
            Place flock
          </Button>
        </>
      }
    >
      <form id="place-flock" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Pen" hint="Only empty pens are listed" error={submitted ? errors.pen : undefined}>
          {(id) => (
            <SelectInput
              id={id}
              value={penId}
              onChange={(e) => setPenId(e.target.value)}
              options={empty.map((p) => ({ value: String(p.id), label: `${p.name} · ${p.description ? `${p.description} · ` : ''}holds ${formatNumber(p.capacity)}` }))}
            />
          )}
        </Field>
        <Field label="Bird type" hint="The flock decides what the pen holds">
          {(id) => (
            <SelectInput
              id={id}
              value={String(birdTypeId)}
              onChange={(e) => changeType(Number(e.target.value))}
              options={catalog.birdTypes.map((b) => {
                const left = batchChoices(catalog, b.id).reduce((n, c) => n + c.left, 0)
                return { value: String(b.id), label: `${b.name}${left ? ` · ${formatNumber(left)} in stock` : ' · none in stock'}` }
              })}
            />
          )}
        </Field>

        <section aria-label="Birds placed" className="flex flex-col gap-2">
          <span className="type-label-md text-fg-primary">Birds from bird stock</span>
          {noStock ? (
            <Alert tone="warning" title={`No ${birdName.toLowerCase()} birds in stock`} action={<AlertAction onClick={() => router.push('/purchases')}>Record a bird purchase</AlertAction>}>
              Birds go into bird stock when their purchase is recorded; place the flock from there.
            </Alert>
          ) : (
            <>
              <BirdSources choices={choices} rows={rows} onChange={changeRows} allowNoPurchase={owner} showErrors={submitted} />
              {(submitted || overCapacity) && errors.sources && <p className="type-body-sm text-fg-danger">{errors.sources}</p>}
            </>
          )}
        </section>

        <div className="flex gap-3">
          <Field label="Breed" className="flex-1">
            {(id) => <TextInput id={id} value={breed} onChange={(e) => setBreed(e.target.value)} />}
          </Field>
          <Field label="Age at placement" className="flex-1" hint="0 for day-old chicks">
            {(id) => <TextInput id={id} inputMode="numeric" suffix="weeks" value={ageWeeks} onChange={(e) => setAgeWeeks(e.target.value)} />}
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
            {formatNumber(totals.birds)} × {defaults.day1Grams} g = {formatNumber(day1Kg)} kg
          </KeyValueRow>
          <KeyValueRow label="Cost of birds" calculated="Birds from each batch × its cost a bird (purchase price ÷ birds received); birds not from a purchase at the cost typed.">
            ₦{formatNumber(Math.round(totals.cost))}
          </KeyValueRow>
          <KeyValueRow label="First entry due" strong>
            {placed ? `${formatShortDate(placed)} · ${staff ?? '—'}` : '—'}
          </KeyValueRow>
        </SummaryBox>
        <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
          <Bird size={16} strokeWidth={1.5} className="shrink-0 text-icon-brand" />
          Placing the flock takes the birds out of bird stock and opens daily entries for this pen.
        </p>
      </form>
    </Drawer>
  )
}
