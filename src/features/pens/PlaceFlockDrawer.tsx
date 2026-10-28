import { Bird } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { AutoInput, DateInput, Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { birdPurchases, emptyPens, flockDefaults, type FlockKind } from '../../data/pens'
import { formatNumber, formatShortDate, parseISODate } from '../../lib/format'

type Props = { open: boolean; onClose: () => void }

const KINDS = ['Broilers', 'Layers', 'Point-of-lay'] as const

export function PlaceFlockDrawer({ open, onClose }: Props) {
  const toast = useToast()
  const [kind, setKind] = useState<FlockKind>('Broilers')
  const [penId, setPenId] = useState(String(emptyPens[0].id))
  const [purchaseCode, setPurchaseCode] = useState(birdPurchases[0].code)
  const purchase = birdPurchases.find((p) => p.code === purchaseCode)!
  const [birds, setBirds] = useState(formatNumber(purchase.birds))
  const [breed, setBreed] = useState(flockDefaults[kind].breed)
  const [date, setDate] = useState(purchase.arrives)

  const pen = emptyPens.find((p) => String(p.id) === penId)!
  const defaults = flockDefaults[kind]
  const birdCount = Number(birds.replace(/,/g, '')) || 0
  const day1Kg = (birdCount * defaults.day1Grams) / 1000
  const costPerBird = birdCount ? Math.round(purchase.cost / birdCount) : 0
  const placed = date ? parseISODate(date) : null
  const overCapacity = birdCount > pen.capacity

  const changeKind = (k: FlockKind) => {
    setKind(k)
    setBreed(flockDefaults[k].breed)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!birdCount || overCapacity || !date) return
    toast(`Flock ${defaults.nextCode} placed in Pen ${pen.id}`)
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Place a new flock"
      subtitle={`Pen ${pen.id} · ${kind.toLowerCase()}${placed ? ` · chicks arrive ${formatShortDate(placed)}` : ''}`}
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
        <Field label="Pen" hint="Only empty pens are listed">
          {(id) => (
            <SelectInput
              id={id}
              value={penId}
              onChange={(e) => setPenId(e.target.value)}
              options={emptyPens.map((p) => ({ value: String(p.id), label: `Pen ${p.id} · empty · holds ${formatNumber(p.capacity)}` }))}
            />
          )}
        </Field>
        <Field
          label="From purchase"
          hint={`${formatNumber(purchase.birds)} ${purchase.age} · ₦${formatNumber(purchase.cost)} · arrives ${formatShortDate(parseISODate(purchase.arrives))}`}
        >
          {(id) => (
            <SelectInput
              id={id}
              value={purchaseCode}
              onChange={(e) => setPurchaseCode(e.target.value)}
              options={birdPurchases.map((p) => ({ value: p.code, label: `${p.code} · ${p.supplier}` }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field
            label="Birds placed"
            className="flex-1"
            error={overCapacity ? `Pen ${pen.id} holds ${formatNumber(pen.capacity)}` : undefined}
          >
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
        <Field label="Flock code" auto hint={`Next ${kind === 'Broilers' ? 'broiler' : 'layer'} flock number`}>
          {(id) => <AutoInput id={id} value={defaults.nextCode} />}
        </Field>
        <Field label="Placement date" hint="Day 1 of the flock">
          {(id) => <DateInput id={id} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <SummaryBox>
          <KeyValueRow label="Feed plan" calculated>{defaults.feedPlan}</KeyValueRow>
          <KeyValueRow label="Expected feed, day 1" calculated>
            {formatNumber(birdCount)} × {defaults.day1Grams} g = {formatNumber(day1Kg)} kg
          </KeyValueRow>
          <KeyValueRow label="Cost per bird" calculated>
            ₦{formatNumber(costPerBird)} · from {purchase.code}
          </KeyValueRow>
          <KeyValueRow label="First entry due" strong>
            {placed ? `${formatShortDate(placed)} · ${pen.attendant}` : '—'}
          </KeyValueRow>
        </SummaryBox>
        <p className="flex items-center gap-2 type-body-sm text-fg-secondary">
          <Bird size={16} strokeWidth={1.5} className="shrink-0 text-icon-brand" />
          Placing the flock opens daily entries for Pen {pen.id} in {pen.attendant}’s pens list and adds it to Pens & flocks.
        </p>
      </form>
    </Drawer>
  )
}
