import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import type { FixedAsset, useFinance } from '../../data/finance'
import { todayISO } from '../../data/metrics'
import { formatNumber } from '../../lib/format'
import { CATEGORY_LABEL, num } from './financeView'

const PAID = ['Cash', 'Bank', 'Already owned'] as const
const LIFE_UNITS = ['Years', 'Months'] as const

type Props = { asset?: FixedAsset; save: ReturnType<typeof useFinance>['save']; onClose: () => void }

/** Add or edit a fixed asset. */
export function AssetModal({ asset, save, onClose }: Props) {
  const toast = useToast()
  const [name, setName] = useState(asset?.name ?? '')
  const [category, setCategory] = useState<FixedAsset['category']>(asset?.category ?? 'equipment')
  const [acquired, setAcquired] = useState(asset?.acquired_on ?? todayISO())
  const [cost, setCost] = useState(asset ? formatNumber(Number(asset.cost)) : '')
  const months = asset?.useful_life_months ?? null
  const [lifeUnit, setLifeUnit] = useState<(typeof LIFE_UNITS)[number]>(months && months % 12 !== 0 ? 'Months' : 'Years')
  const [life, setLife] = useState(months ? String(months % 12 === 0 ? months / 12 : months) : '5')
  const [salvage, setSalvage] = useState(asset ? formatNumber(Number(asset.salvage_value)) : '0')
  const [paid, setPaid] = useState<(typeof PAID)[number]>(asset ? (asset.paid_from === 'bank' ? 'Bank' : asset.paid_from === 'cash' ? 'Cash' : 'Already owned') : 'Bank')
  const [notes, setNotes] = useState(asset?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const land = category === 'land'
  const lifeMonths = land ? null : lifeUnit === 'Years' ? Math.round(num(life) * 12) : Math.round(num(life))
  const errors = {
    name: name.trim() ? undefined : 'Enter a name',
    cost: num(cost) > 0 ? undefined : 'Enter what it cost',
    life: land || (lifeMonths && lifeMonths > 0) ? undefined : 'Enter how long it will be used',
    salvage: num(salvage) <= num(cost) ? undefined : 'More than the cost',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    const row = {
      name: name.trim(),
      category,
      acquired_on: acquired,
      cost: num(cost),
      useful_life_months: lifeMonths,
      salvage_value: land ? 0 : num(salvage),
      paid_from: paid === 'Cash' ? 'cash' : paid === 'Bank' ? 'bank' : null,
      notes: notes.trim() || null,
    }
    const ok = await save((db) => (asset ? db.from('fixed_assets').update(row).eq('id', asset.id) : db.from('fixed_assets').insert(row)))
    setSaving(false)
    if (!ok) return
    toast(asset ? `${row.name} saved` : `${row.name} added`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={asset ? `Edit ${asset.name}` : 'Add a fixed asset'}
      subtitle="Land, buildings, equipment, machinery and vehicles the farm uses for more than a year."
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="asset" disabled={saving}>
            {saving ? 'Saving…' : asset ? 'Save' : 'Add asset'}
          </Button>
        </>
      }
    >
      <form id="asset" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Name" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} placeholder="e.g. 20 kVA generator" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind">
            {(id) => (
              <SelectInput
                id={id}
                value={category}
                onChange={(e) => setCategory(e.target.value as FixedAsset['category'])}
                options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
              />
            )}
          </Field>
          <Field label="Bought or brought in on">
            {(id) => <TextInput id={id} type="date" value={acquired} max={todayISO()} onChange={(e) => setAcquired(e.target.value)} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cost" error={submitted ? errors.cost : undefined}>
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} onBlur={() => num(cost) && setCost(formatNumber(num(cost)))} />}
          </Field>
          {!land && (
            <Field label="Value at the end of its life" hint="What it could be sold for; often 0" error={submitted ? errors.salvage : undefined}>
              {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={salvage} onChange={(e) => setSalvage(e.target.value)} onBlur={() => setSalvage(formatNumber(num(salvage)))} />}
            </Field>
          )}
        </div>
        {land ? (
          <p className="type-body-sm text-fg-tertiary">Land isn’t depreciated: it stays at cost on the Balance Sheet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Field label="Useful life" hint="Its cost (less end value) is spread evenly over this time as depreciation" error={submitted ? errors.life : undefined}>
              {(id) => <TextInput id={id} inputMode="numeric" suffix={lifeUnit.toLowerCase()} value={life} onChange={(e) => setLife(e.target.value)} />}
            </Field>
            <SegmentedControl label="Life in" options={LIFE_UNITS} value={lifeUnit} onChange={setLifeUnit} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="type-label-md text-fg-primary">How it was paid for</span>
          <SegmentedControl fullWidth label="How it was paid for" options={PAID} value={paid} onChange={setPaid} />
          <p className="type-body-sm text-fg-tertiary">
            {paid === 'Already owned'
              ? 'Owned at go-live or brought in by the owner: no money left the cash or bank, and its value counts as owner’s capital.'
              : `Paid from ${paid.toLowerCase()} on that date: it comes off the ${paid.toLowerCase()} balance.`}
          </p>
        </div>
        <Field label="Notes">{(id) => <TextInput id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      </form>
    </Modal>
  )
}

/** Record that an asset was sold or scrapped. */
export function DisposeModal({ asset, save, onClose }: { asset: FixedAsset; save: Props['save']; onClose: () => void }) {
  const toast = useToast()
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('0')
  const [account, setAccount] = useState<'Cash' | 'Bank'>('Bank')
  const [saving, setSaving] = useState(false)
  const tooEarly = date < asset.acquired_on

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (tooEarly) return
    setSaving(true)
    const ok = await save((db) =>
      db
        .from('fixed_assets')
        .update({ disposed_on: date, disposal_amount: num(amount), disposal_account: num(amount) > 0 ? account.toLowerCase() : null })
        .eq('id', asset.id),
    )
    setSaving(false)
    if (!ok) return
    toast(`${asset.name} disposed of`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dispose of ${asset.name}`}
      subtitle="Sold, scrapped or written off. It leaves the Balance Sheet; any gain or loss against its book value goes to the Income Statement."
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="danger" className="flex-1" type="submit" form="dispose" disabled={saving || tooEarly}>
            {saving ? 'Saving…' : 'Dispose of it'}
          </Button>
        </>
      }
    >
      <form id="dispose" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Date" error={tooEarly ? 'Before it was bought' : undefined}>
          {(id) => <TextInput id={id} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Amount received" hint="0 if it was scrapped">
          {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => setAmount(formatNumber(num(amount)))} />}
        </Field>
        {num(amount) > 0 && <SegmentedControl fullWidth label="Paid into" options={['Cash', 'Bank'] as const} value={account} onChange={setAccount} />}
      </form>
    </Modal>
  )
}
