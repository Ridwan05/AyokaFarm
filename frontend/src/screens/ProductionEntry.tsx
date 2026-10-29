'use client'

import { Check, Minus, Plus, Trash2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { AutoInput, Field, SelectInput, TextInput } from '../components/ui/Form'

import { feedTypes, medications } from '../data/inventory'
import { BAG_KG, entryContext, formatAge, MEDICATION_MODES, MEDICATION_PURPOSES, todayISO, type MedicationLine } from '../data/production'
import { farm } from '../data/session'
import { useCurrentUser } from '../data/sessionContext'
import { useTrade } from '../data/tradeContext'
import { isAttendant } from '../lib/access'
import { cn } from '../lib/cn'
import { formatNumber, formatShortDate, formatSignedPct } from '../lib/format'
import { explain } from '../data/explain'
import { farmSettings } from '../data/farmSettings'

type Draft = {
  died: string
  feedType: string
  feedBags: string
  crates: string
  pieces: string
  cracked: string
  meds: { medication: string; qty: string; mode: MedicationLine['mode']; purpose: MedicationLine['purpose'] }[]
}

/** A typed count, or null while the field is empty. */
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))

const draftKey = (penId: number) => `ayk:entry:${penId}:${todayISO()}`

// Unsaved entries survive a dropped connection or a closed tab (BRD §10).
function loadDraft(penId: number): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(penId))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
function saveDraft(penId: number, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(penId), JSON.stringify(draft))
    else localStorage.removeItem(draftKey(penId))
  } catch {
    // Storage blocked (private mode): the form still works, it just won't survive a reload.
  }
}

const clockTime = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** − value + for whole-number counts: big targets for a thumb in the pen. */
function Stepper({ id, value, onChange, invalid }: { id: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const n = num(value) ?? 0
  const step = (d: number) => onChange(String(Math.max(0, n + d)))
  const btn =
    'flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line-strong bg-surface text-icon-primary shadow-xs transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94] disabled:cursor-not-allowed disabled:text-icon-disabled'
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="One less" className={btn} disabled={n <= 0} onClick={() => step(-1)}>
        <Minus size={20} strokeWidth={1.5} />
      </button>
      <TextInput id={id} inputMode="numeric" pattern="[0-9]*" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} invalid={invalid} className="min-w-0 [&_input]:text-center" />
      <button type="button" aria-label="One more" className={btn} onClick={() => step(1)}>
        <Plus size={20} strokeWidth={1.5} />
      </button>
    </div>
  )
}

/** P-M2 · Daily entry for one pen (BRD §5.6). One per pen per day. */
export default function ProductionEntry() {
  const { penId: param } = useParams<{ penId: string }>()
  const penId = Number(param)
  const router = useRouter()
  const user = useCurrentUser()
  const { productionRecords, addProductionRecord, stockOf } = useTrade()
  const ctx = entryContext(penId)

  const blank: Draft = { died: '', feedType: ctx?.feedType ?? feedTypes[0].name, feedBags: '', crates: '', pieces: '', cracked: '', meds: [] }
  const [draft, setDraft] = useState<Draft>(blank)
  const [restored, setRestored] = useState(false)
  const [saved, setSaved] = useState(false)

  // Read after mount: the server render has no access to this phone's storage.
  useEffect(() => {
    const d = loadDraft(penId)
    if (d) {
      // oxlint-disable-next-line react/set-state-in-effect
      setDraft(d)
      setRestored(true)
    }
  }, [penId])
  const touched = JSON.stringify(draft) !== JSON.stringify(blank)
  useEffect(() => {
    if (!saved && touched) saveDraft(penId, draft)
  }, [draft, penId, saved, touched])

  if (!ctx) {
    return <PageHeader backTo="/" title="Pen not found" description={`There is no Pen ${param} on the farm.`} />
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setMed = (i: number, patch: Partial<Draft['meds'][number]>) => set('meds', draft.meds.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const layers = ctx.type === 'Layers'
  const today = todayISO()
  const backTo = isAttendant(user.role) ? '/' : `/pens/${penId}`

  const existing = productionRecords.find((r) => r.penId === penId && r.date === today)
  const recordedAt = existing?.time ?? ctx.recordedAt

  // Calculated fields
  const died = num(draft.died)
  const closing = ctx.opening - (died ?? 0)
  const mortalityPct = died !== null && ctx.opening ? (died / ctx.opening) * 100 : 0
  const overMortality = mortalityPct > farmSettings.mortalityAlertPct
  const bags = num(draft.feedBags)
  const feedKg = (bags ?? 0) * BAG_KG
  const expectedKg = (closing * ctx.gramsPerBird) / 1000
  const variance = bags !== null && expectedKg ? ((feedKg - expectedKg) / expectedKg) * 100 : null
  const varianceOff = variance !== null && Math.abs(variance) > farmSettings.feedVariancePct
  const eggs = layers ? (num(draft.crates) ?? 0) * farmSettings.eggsPerCrate + (num(draft.pieces) ?? 0) : null
  const cracked = layers ? num(draft.cracked) ?? 0 : null
  const layingRate = eggs !== null && closing ? (eggs / closing) * 100 : null

  // FR-MED-1: a pen can't use more of a medication than the store holds.
  const medStock = (name: string) => {
    const m = medications.find((x) => x.name === name)
    return m ? { stock: stockOf(m.name, m.stock), unit: m.unit } : { stock: 0, unit: '' }
  }
  const medError = (i: number) => {
    const line = draft.meds[i]
    const qty = num(line.qty)
    if (qty === null) return undefined
    if (qty <= 0) return 'Enter how much was used'
    const usedOnPen = draft.meds.filter((m) => m.medication === line.medication).reduce((n, m) => n + (num(m.qty) ?? 0), 0)
    const { stock, unit } = medStock(line.medication)
    return usedOnPen > stock ? `Only ${formatNumber(stock)} ${unit} in the store` : undefined
  }

  const diedError = died !== null && died > ctx.opening ? `There are only ${formatNumber(ctx.opening)} birds in the pen` : undefined
  const valid =
    died !== null &&
    !diedError &&
    bags !== null &&
    (!layers || (num(draft.crates) !== null && num(draft.pieces) !== null)) &&
    draft.meds.every((m, i) => num(m.qty) !== null && !medError(i))

  async function save() {
    if (!valid || !ctx) return
    if (!(await addProductionRecord({
      penId,
      date: today,
      time: clockTime(),
      opening: ctx.opening,
      died: died!,
      closing,
      feedType: draft.feedType,
      feedBags: bags!,
      expectedKg,
      feedVsExpected: variance ?? 0,
      eggs,
      cracked,
      layingRate,
      medications: draft.meds.map((m) => ({ medication: m.medication, qty: num(m.qty)!, mode: m.mode, purpose: m.purpose })),
      recordedBy: user.name.split(' ')[0],
    }))) return
    saveDraft(penId, null)
    setSaved(true)
    if (overMortality) {
      toast.warning(`Pen ${penId}: ${died} died today (${mortalityPct.toFixed(1)}%)`, { description: 'Above the 0.5% alert level. Emeka and Adeola have been told on WhatsApp.' })
    } else {
      toast.success(`Pen ${penId} recorded for today`)
    }
    window.setTimeout(() => router.push(backTo), 700)
  }

  const header = (
    <PageHeader
      backTo={backTo}
      eyebrow={[`Pen ${penId} · ${ctx.type}`, formatShortDate(farm.today)]}
      title="Today’s entry"
      description={`Flock ${ctx.pen.flock} · ${ctx.pen.breed} · age ${formatAge(ctx.ageDays)}`}
    />
  )

  // FR-PRD-1: one record per pen per day.
  if (recordedAt && !saved) {
    return (
      <>
        {header}
        <Alert tone="success" title={`Pen ${penId} is already recorded for today (${recordedAt})`}>
          There’s one entry per pen per day. To correct it, ask Emeka — the farm manager can edit it with a reason.
        </Alert>
        <div>
          <Button onClick={() => router.push(backTo)}>Back</Button>
        </div>
      </>
    )
  }

  return (
    <>
      {header}
      {restored && (
        <Alert compact title="Picked up where you left off" onDismiss={() => setRestored(false)}>
          Your unsaved entry was kept on this phone.
        </Alert>
      )}

      <form
        className="flex flex-col gap-4 lg:max-w-[720px]"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Card>
          <CardHeader title="Birds" />
          <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-3">
            <Field label="Opening" auto hint="Yesterday’s closing">
              {(id) => <AutoInput id={id} value={formatNumber(ctx.opening)} label="Opening" info="Yesterday’s closing count for this flock, or the birds placed if this is the first entry." />}
            </Field>
            <Field label="Died today" error={diedError}>
              {(id) => <Stepper id={id} value={draft.died} onChange={(v) => set('died', v)} invalid={!!diedError} />}
            </Field>
            <Field label="Closing" auto hint="Opening − died">
              {(id) => <AutoInput id={id} value={formatNumber(closing)} label="Closing" info="Opening birds − birds that died today." />}
            </Field>
          </div>
          {overMortality && (
            <div className="px-5 pb-5">
              <Alert tone="danger" compact title={`${mortalityPct.toFixed(1)}% died — above the ${farmSettings.mortalityAlertPct}% alert level`}>
                Saving tells Emeka and Adeola straight away. Add a note to the vet if you see signs of illness.
              </Alert>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Feed" meta={<span className="type-body-sm text-fg-tertiary">{BAG_KG} kg bags</span>} />
          <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
            <Field label="Feed type" hint={`Recommended at this age: ${ctx.feedType}`}>
              {(id) => (
                <SelectInput
                  id={id}
                  value={draft.feedType}
                  onChange={(e) => set('feedType', e.target.value)}
                  options={feedTypes.map((f) => ({ value: f.name, label: f.name }))}
                />
              )}
            </Field>
            <Field label="Bags used">
              {(id) => (
                <TextInput
                  id={id}
                  inputMode="decimal"
                  placeholder="e.g. 5.5"
                  suffix="bags"
                  value={draft.feedBags}
                  onChange={(e) => set('feedBags', e.target.value.replace(/[^\d.]/g, ''))}
                />
              )}
            </Field>
            <Field label="Feed used" auto hint={`Expected ${formatNumber(Math.round(expectedKg))} kg · ${ctx.gramsPerBird} g a bird`}>
              {(id) => <AutoInput id={id} value={`${formatNumber(Math.round(feedKg))} kg`} label="Feed used" info="Bags used × kg in a bag of the chosen feed (Settings → Feed & targets)." />}
            </Field>
            <Field
              label="vs expected"
              auto
              hint={varianceOff ? `Outside ±${farmSettings.feedVariancePct}% — check for spills or a wrong count` : `Within ±${farmSettings.feedVariancePct}% is normal`}
            >
              {(id) => (
                <div className={cn('rounded-md', varianceOff && '[&_output]:text-fg-warning')}>
                  <AutoInput id={id} value={variance === null ? '—' : formatSignedPct(variance)} label="vs expected" info={explain.feedVsExpected()} />
                </div>
              )}
            </Field>
          </div>
        </Card>

        {layers && (
          <Card>
            <CardHeader title="Eggs" meta={<span className="type-body-sm text-fg-tertiary">{farmSettings.eggsPerCrate} to a crate</span>} />
            <div className="grid grid-cols-2 gap-4 px-5 pb-5 sm:grid-cols-4">
              <Field label="Crates">
                {(id) => <TextInput id={id} inputMode="numeric" pattern="[0-9]*" value={draft.crates} onChange={(e) => set('crates', e.target.value.replace(/\D/g, ''))} />}
              </Field>
              <Field label="Loose eggs">
                {(id) => <TextInput id={id} inputMode="numeric" pattern="[0-9]*" value={draft.pieces} onChange={(e) => set('pieces', e.target.value.replace(/\D/g, ''))} />}
              </Field>
              <Field label="Cracked" hint="Of those collected">
                {(id) => <TextInput id={id} inputMode="numeric" pattern="[0-9]*" placeholder="0" value={draft.cracked} onChange={(e) => set('cracked', e.target.value.replace(/\D/g, ''))} />}
              </Field>
              <Field label="Laying rate" auto hint={`${formatNumber(eggs ?? 0)} eggs`}>
                {(id) => <AutoInput id={id} value={layingRate === null ? '—' : `${layingRate.toFixed(1)}%`} label="Laying rate" info={`Eggs collected (crates × ${farmSettings.eggsPerCrate} + loose) ÷ opening birds.`} />}
              </Field>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Medication" meta={<span className="type-body-sm text-fg-tertiary">{draft.meds.length ? `${draft.meds.length} given` : 'None today'}</span>} />
          <div className="flex flex-col gap-4 px-5 pb-5">
            {draft.meds.map((line, i) => {
              const { stock, unit } = medStock(line.medication)
              const error = medError(i)
              return (
                <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-line-subtle bg-canvas p-3 sm:grid-cols-2">
                  <Field label="Medication" className="sm:col-span-2">
                    {(id) => (
                      <div className="flex gap-2">
                        <SelectInput
                          id={id}
                          value={line.medication}
                          onChange={(e) => setMed(i, { medication: e.target.value })}
                          options={medications.map((m) => ({ value: m.name, label: m.name }))}
                        />
                        <button
                          type="button"
                          aria-label="Remove medication"
                          onClick={() => set('meds', draft.meds.filter((_, j) => j !== i))}
                          className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-md text-icon-secondary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94]"
                        >
                          <Trash2 size={20} strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </Field>
                  <Field label="Quantity" error={error} hint={`${formatNumber(stock)} ${unit} in the store`}>
                    {(id) => (
                      <TextInput id={id} inputMode="decimal" suffix={unit} value={line.qty} invalid={!!error} onChange={(e) => setMed(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} />
                    )}
                  </Field>
                  <Field label="Given by">
                    {(id) => (
                      <SelectInput id={id} value={line.mode} onChange={(e) => setMed(i, { mode: e.target.value as MedicationLine['mode'] })} options={MEDICATION_MODES.map((m) => ({ value: m, label: m }))} />
                    )}
                  </Field>
                  <Field label="Purpose" className="sm:col-span-2">
                    {(id) => (
                      <SelectInput
                        id={id}
                        value={line.purpose}
                        onChange={(e) => setMed(i, { purpose: e.target.value as MedicationLine['purpose'] })}
                        options={MEDICATION_PURPOSES.map((p) => ({ value: p, label: p }))}
                      />
                    )}
                  </Field>
                </div>
              )
            })}
            <div>
              <Button
                leadingIcon={Plus}
                onClick={() => set('meds', [...draft.meds, { medication: medications[0].name, qty: '', mode: 'Water', purpose: 'Prevention' }])}
              >
                Add medication
              </Button>
            </div>
          </div>
        </Card>

        {/* Pinned to the bottom on phones so Save is always under the thumb. */}
        <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-canvas/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <Button size="lg" className="flex-1 lg:flex-none" onClick={() => router.push(backTo)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="lg" className="flex-[2] lg:flex-none" disabled={!valid || saved}>
            {/* Crossfade the label with a little blur so the state change reads as one motion. */}
            <span className="grid place-items-center">
              <span className={cn('col-start-1 row-start-1 transition-[opacity,filter] duration-200 ease-out', saved && 'opacity-0 blur-[2px]')}>Save entry</span>
              <span className={cn('col-start-1 row-start-1 flex items-center gap-1.5 transition-[opacity,filter] duration-200 ease-out', !saved && 'opacity-0 blur-[2px]')} aria-hidden={!saved}>
                <Check size={20} strokeWidth={2} /> Saved
              </span>
            </span>
          </Button>
        </div>
      </form>
    </>
  )
}
