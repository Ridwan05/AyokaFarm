'use client'

import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { RowMenu, type MenuItem } from '../../components/ui/Menu'
import { Modal, Presence } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canEditSettings } from '../../lib/access'
import { createClient } from '../../lib/supabase/client'
import type { Tables, TablesUpdate } from '../../lib/supabase/database.types'
import { SettingsHeader } from './SettingsHeader'
import { SectionTitle } from './FarmProfile'

type Band = Tables<'feed_targets'>
type FeedType = Tables<'feed_types'>
type FeedTypeRow = FeedType & { usedBy: string }

const THRESHOLDS = [
  { key: 'mortality_alert_pct', label: 'Mortality alert', suffix: '% of birds a day', decimal: true },
  { key: 'feed_variance_pct', label: 'Feed variance tolerance', suffix: '± %', decimal: true },
  { key: 'low_stock_days', label: 'Low feed stock', suffix: 'days of cover' },
  { key: 'expiry_warning_days', label: 'Medication expiry warning', suffix: 'days ahead' },
  { key: 'missing_entry_cutoff', label: 'Missing entry cut-off', suffix: 'daily', time: true },
  { key: 'overdue_debt_days', label: 'Overdue debt', suffix: 'days' },
  { key: 'eggs_per_crate', label: 'Eggs in a crate', suffix: 'eggs' },
] as const
type ThresholdKey = (typeof THRESHOLDS)[number]['key']

/** "Permission denied" → a sentence for the owner-only settings. */
const why = (message: string) => (/row-level security|permission/i.test(message) ? 'Only the owner can change feed and targets.' : message)

export default function FeedTargets() {
  const user = useCurrentUser()
  const { catalog, history, settings, reload } = useTrade()
  const editable = canEditSettings(user)
  const db = createClient()

  // One tab per bird type and breed that has bands, plus every bird type (to start bands for it).
  const groups = [
    ...new Map(
      [
        ...catalog.feedTargets.map((t) => ({ birdTypeId: t.bird_type_id, breed: t.breed })),
        ...catalog.birdTypes.filter((b) => b.is_active).map((b) => ({ birdTypeId: b.id, breed: null as string | null })),
      ]
        .filter((g, _, all) => g.breed !== null || !all.some((x) => x.birdTypeId === g.birdTypeId && x.breed !== null))
        .map((g) => {
          const bird = catalog.birdTypes.find((b) => b.id === g.birdTypeId)?.name ?? 'Birds'
          return [`${bird}s · ${g.breed ?? 'any breed'}`, g] as const
        }),
    ),
  ]
  const [groupLabel, setGroupLabel] = useState(groups[0]?.[0] ?? '')
  const group = groups.find(([label]) => label === groupLabel)?.[1] ?? groups[0]?.[1]
  const bands = catalog.feedTargets.filter((t) => t.bird_type_id === group?.birdTypeId && t.breed === group?.breed).sort((a, b) => a.week_from - b.week_from)

  const [values, setValues] = useState(() => thresholdValues(settings))
  const savedValues = thresholdValues(settings)
  const dirty = THRESHOLDS.some((t) => values[t.key] !== savedValues[t.key])
  const [saving, setSaving] = useState(false)
  const [band, setBand] = useState<Band | 'new' | null>(null)
  const [feedType, setFeedType] = useState<FeedType | 'new' | null>(null)

  // Which pens are eating each feed now (their latest entry).
  const latestFeed = new Map<number, number | null>()
  for (const d of [...history.daily].sort((a, b) => b.date.localeCompare(a.date))) if (!latestFeed.has(d.penId)) latestFeed.set(d.penId, d.feedTypeId)
  const feedRows: FeedTypeRow[] = catalog.feedTypes.map((f) => {
    const pens = catalog.pens.filter((p) => latestFeed.get(p.id) === f.id).map((p) => p.name)
    return { ...f, usedBy: pens.join(', ') || '—' }
  })

  async function saveThresholds() {
    const patch: TablesUpdate<'farm_settings'> = {}
    for (const t of THRESHOLDS) {
      const v = values[t.key].trim()
      if ('time' in t) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return toast.error(`${t.label}: use a time like 18:00`)
        patch.missing_entry_cutoff = v
      } else {
        const n = Number(v)
        if (!v || !Number.isFinite(n) || n < 0 || (!('decimal' in t) && !Number.isInteger(n))) return toast.error(`${t.label}: enter a ${'decimal' in t ? 'number' : 'whole number'}`)
        Object.assign(patch, { [t.key]: n })
      }
    }
    if (patch.eggs_per_crate !== undefined && patch.eggs_per_crate < 1) return toast.error('Eggs in a crate: enter 1 or more')
    setSaving(true)
    const { error } = await db.from('farm_settings').update(patch).eq('id', true)
    // Egg products sell by the crate but take eggs out of stock, so they follow the crate size too.
    const crateChanged = !error && patch.eggs_per_crate !== undefined && patch.eggs_per_crate !== Number(settings?.eggs_per_crate ?? 30)
    const crateError = crateChanged
      ? (await db.from('products').update({ stock_units_per_unit: patch.eggs_per_crate }).in('stock_item', ['eggs', 'cracked_eggs'])).error
      : null
    setSaving(false)
    if (error) return toast.error(why(error.message))
    if (crateError) toast.error(`Thresholds saved, but egg products still use the old crate size: ${why(crateError.message)}`)
    toast.success('Alert thresholds saved')
    await reload()
  }

  async function removeBand(b: Band) {
    const { error } = await db.from('feed_targets').delete().eq('id', b.id)
    if (error) return toast.error(why(error.message))
    toast.success(`Band from week ${b.week_from} removed`)
    await reload()
  }

  async function setActive(f: FeedType, active: boolean) {
    const { error } = await db.from('feed_types').update({ is_active: active }).eq('id', f.id)
    if (error) return toast.error(why(error.message))
    toast.success(`${f.name} ${active ? 'is active again' : 'is hidden from new entries and purchases'}`)
    await reload()
  }

  const typeColumns: Column<FeedTypeRow>[] = [
    { key: 'name', header: 'Name', render: (f) => <TextCell tone="primary">{f.name}</TextCell> },
    { key: 'bag', header: 'Bag weight', align: 'right', width: 120, render: (f) => <NumberCell>{Number(f.bag_kg)} kg</NumberCell> },
    { key: 'reorder', header: 'Reorder at', align: 'right', width: 130, render: (f) => <NumberCell>{f.reorder_level_bags} bags</NumberCell> },
    { key: 'usedBy', header: 'Used by', width: 200, render: (f) => <TextCell>{f.usedBy}</TextCell> },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      render: (f) => (
        <Badge dot tone={f.is_active ? 'success' : 'neutral'}>
          {f.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ]

  return (
    <>
      <SettingsHeader
        title="Feed & targets"
        description="The numbers behind every Auto field and alert. Only the owner can change them, and every change is logged."
        actions={
          editable && (
            <Button variant="primary" disabled={!dirty || saving} onClick={() => void saveThresholds()}>
              {saving ? 'Saving…' : 'Save thresholds'}
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1 gap-4 p-5">
          <SectionTitle title="Expected feed by age" note="g per bird per day" />
          {groups.length > 0 && (
            <div className="self-start">
              <SegmentedControl label="Bird type and breed" options={groups.map(([label]) => label)} value={groupLabel} onChange={setGroupLabel} />
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr>
                  {['From week', 'To week', 'Feed', 'Feed type', ''].map((h, i) => (
                    <th key={i} className={`h-10 border-b border-line px-6 type-overline text-fg-tertiary ${i < 3 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.id} className="border-b border-line-subtle last:border-b-0">
                    <td className="h-14 px-6 text-right type-numeric-md text-fg-primary">{b.week_from}</td>
                    <td className="px-6 text-right type-numeric-md text-fg-primary">{b.week_to ?? 'and over'}</td>
                    <td className="px-6 text-right type-numeric-md text-fg-primary">{Number(b.grams_per_bird_day)} g</td>
                    <td className="px-6 type-body-md text-fg-secondary">{catalog.feedTypes.find((f) => f.id === b.recommended_feed_type_id)?.name ?? '—'}</td>
                    <td className="w-14 pr-3 text-right">
                      {editable && (
                        <RowMenu
                          items={[
                            { label: 'Edit band', onSelect: () => setBand(b) },
                            { label: 'Remove band', danger: true, onSelect: () => void removeBand(b) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {bands.length === 0 && (
                  <tr>
                    <td colSpan={5} className="h-14 px-6 type-body-md text-fg-secondary">
                      No bands yet — daily entries for these birds show no expected feed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <p className="flex-1 type-body-sm text-fg-secondary">One value per band, and bands can’t overlap. Each pen entry uses the band for its flock’s age.</p>
            {editable && group && (
              <Button variant="ghost" leadingIcon={Plus} onClick={() => setBand('new')}>
                Add band
              </Button>
            )}
          </div>
        </Card>
        <Card className="w-full shrink-0 lg:w-[380px] gap-4 p-5">
          <SectionTitle title="Alert thresholds" note="When alerts fire" />
          <fieldset disabled={!editable} className="contents">
            {THRESHOLDS.map((t) => (
              <Field key={t.key} label={t.label} className="-mt-1">
                {(id) => (
                  <TextInput
                    id={id}
                    size="md"
                    inputMode={'time' in t ? 'text' : 'decimal'}
                    value={values[t.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.value }))}
                    suffix={t.suffix}
                  />
                )}
              </Field>
            ))}
          </fieldset>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Feed types"
          meta={<span className="hidden type-body-sm text-fg-tertiary sm:inline">Bag weight drives every kg figure</span>}
          action={editable ? { label: 'Add feed type', onClick: () => setFeedType('new') } : undefined}
        />
        <Table
          columns={typeColumns}
          rows={feedRows}
          rowKey={(f) => String(f.id)}
          actionsWidth={56}
          rowActions={
            editable
              ? (f) => (
                  <RowMenu
                    items={
                      [
                        { label: 'Edit', onSelect: () => setFeedType(f) },
                        f.is_active ? { label: 'Deactivate', danger: true, onSelect: () => void setActive(f, false) } : { label: 'Activate', onSelect: () => void setActive(f, true) },
                      ] satisfies MenuItem[]
                    }
                  />
                )
              : undefined
          }
        />
      </Card>
      <Presence>
        {band && group && <BandModal band={band === 'new' ? null : band} group={group} groupLabel={groupLabel} bands={bands} feedTypes={catalog.feedTypes} onClose={() => setBand(null)} onSaved={reload} />}
      </Presence>
      <Presence>{feedType && <FeedTypeModal feedType={feedType === 'new' ? null : feedType} all={catalog.feedTypes} onClose={() => setFeedType(null)} onSaved={reload} />}</Presence>
    </>
  )
}

function thresholdValues(s: Tables<'farm_settings'> | null): Record<ThresholdKey, string> {
  return {
    mortality_alert_pct: String(Number(s?.mortality_alert_pct ?? 0.5)),
    feed_variance_pct: String(Number(s?.feed_variance_pct ?? 10)),
    low_stock_days: String(s?.low_stock_days ?? 5),
    expiry_warning_days: String(s?.expiry_warning_days ?? 30),
    missing_entry_cutoff: (s?.missing_entry_cutoff ?? '18:00').slice(0, 5),
    overdue_debt_days: String(s?.overdue_debt_days ?? 60),
    eggs_per_crate: String(s?.eggs_per_crate ?? 30),
  }
}

function BandModal({
  band,
  group,
  groupLabel,
  bands,
  feedTypes,
  onClose,
  onSaved,
}: {
  band: Band | null
  group: { birdTypeId: number; breed: string | null }
  groupLabel: string
  bands: Band[]
  feedTypes: FeedType[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const last = bands[bands.length - 1]
  const [from, setFrom] = useState(String(band?.week_from ?? (last ? (last.week_to ?? last.week_from) + 1 : 1)))
  const [to, setTo] = useState(band?.week_to ? String(band.week_to) : '')
  const [grams, setGrams] = useState(band ? String(Number(band.grams_per_bird_day)) : '')
  const [feed, setFeed] = useState(String(band?.recommended_feed_type_id ?? last?.recommended_feed_type_id ?? feedTypes.find((f) => f.is_active)?.id ?? ''))
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const f = Number(from)
    const t = to.trim() ? Number(to) : null
    const g = Number(grams)
    if (!Number.isInteger(f) || f < 1) return toast.error('From week must be 1 or more')
    if (t !== null && (!Number.isInteger(t) || t < f)) return toast.error('To week must be a whole number from the start week on, or blank for “and over”')
    if (!(g > 0)) return toast.error('Enter grams per bird per day')
    const end = t ?? Infinity
    const clash = bands.find((b) => b.id !== band?.id && f <= (b.week_to ?? Infinity) && b.week_from <= end)
    if (clash) return toast.error(`Overlaps the band from week ${clash.week_from}${clash.week_to ? ` to ${clash.week_to}` : ' and over'}`)
    setBusy(true)
    const row = { bird_type_id: group.birdTypeId, breed: group.breed, week_from: f, week_to: t, grams_per_bird_day: g, recommended_feed_type_id: feed ? Number(feed) : null }
    const db = createClient()
    const { error } = band ? await db.from('feed_targets').update(row).eq('id', band.id) : await db.from('feed_targets').insert(row)
    setBusy(false)
    if (error) return toast.error(why(error.message))
    toast.success(band ? 'Band updated' : 'Band added')
    onClose()
    await onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={band ? 'Edit band' : 'Add band'}
      subtitle={groupLabel}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="feed-band" disabled={busy}>
            {busy ? 'Saving…' : 'Save band'}
          </Button>
        </>
      }
    >
      <form id="feed-band" onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex gap-4">
          <Field label="From week" className="flex-1">{(id) => <TextInput id={id} inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To week" hint="Blank = and over" className="flex-1">{(id) => <TextInput id={id} inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <Field label="Feed per bird per day">{(id) => <TextInput id={id} inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} suffix="g" />}</Field>
        <Field label="Feed type">
          {(id) => <SelectInput id={id} value={feed} onChange={(e) => setFeed(e.target.value)} options={[{ value: '', label: 'Not set' }, ...feedTypes.filter((f) => f.is_active || String(f.id) === feed).map((f) => ({ value: String(f.id), label: f.name }))]} />}
        </Field>
      </form>
    </Modal>
  )
}

function FeedTypeModal({ feedType, all, onClose, onSaved }: { feedType: FeedType | null; all: FeedType[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(feedType?.name ?? '')
  const [bagKg, setBagKg] = useState(String(feedType ? Number(feedType.bag_kg) : 25))
  const [reorder, setReorder] = useState(String(feedType?.reorder_level_bags ?? ''))
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return toast.error('Enter the feed’s name')
    if (all.some((f) => f.id !== feedType?.id && f.name.toLowerCase() === n.toLowerCase())) return toast.error('There’s already a feed type with that name')
    if (!(Number(bagKg) > 0)) return toast.error('Enter the bag weight in kg')
    if (!(Number(reorder) >= 0) || !Number.isInteger(Number(reorder))) return toast.error('Enter the reorder level in whole bags')
    setBusy(true)
    const row = { name: n, bag_kg: Number(bagKg), reorder_level_bags: Number(reorder) }
    const db = createClient()
    const { error } = feedType ? await db.from('feed_types').update(row).eq('id', feedType.id) : await db.from('feed_types').insert(row)
    setBusy(false)
    if (error) return toast.error(why(error.message))
    toast.success(feedType ? `${n} updated` : `${n} added`)
    onClose()
    await onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={feedType ? `Edit ${feedType.name}` : 'Add feed type'}
      subtitle={feedType ? 'Changing the bag weight changes kg figures from now on' : 'It can then be bought, received and used in daily entries'}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="feed-type" disabled={busy}>
            {busy ? 'Saving…' : feedType ? 'Save' : 'Add feed type'}
          </Button>
        </>
      }
    >
      <form id="feed-type" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pullet grower" />}</Field>
        <div className="flex gap-4">
          <Field label="Bag weight" className="flex-1">{(id) => <TextInput id={id} inputMode="decimal" value={bagKg} onChange={(e) => setBagKg(e.target.value)} suffix="kg" />}</Field>
          <Field label="Reorder at" className="flex-1">{(id) => <TextInput id={id} inputMode="numeric" value={reorder} onChange={(e) => setReorder(e.target.value)} suffix="bags" />}</Field>
        </div>
      </form>
    </Modal>
  )
}
