'use client'

import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { RowMenu } from '../../components/ui/Menu'
import { Modal, Presence } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { addDays, dayMonth, weekdayDayMonth } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { can, canEditSettings } from '../../lib/access'
import { cn } from '../../lib/cn'
import { formatNaira, formatNumber } from '../../lib/format'
import { createClient } from '../../lib/supabase/client'
import type { Database } from '../../lib/supabase/database.types'

type Party = { id: number; kind: 'customer' | 'supplier'; name: string; opening: number; source: string | null; checked: boolean }
type StockItem = Database['public']['Enums']['stock_item']

const why = (message: string) => (/row-level security|permission/i.test(message) ? 'You don’t have permission to change this.' : message)

export default function GoLive() {
  const router = useRouter()
  const user = useCurrentUser()
  const { settings, catalog, history, reload } = useTrade()
  const editable = canEditSettings(user)
  const [side, setSide] = useState('Customers')
  const [editing, setEditing] = useState<Party | null>(null)
  const [addingStock, setAddingStock] = useState(false)

  const goLive = settings?.go_live_date ?? null
  const asAt = goLive ? weekdayDayMonth(goLive) + ' ' + goLive.slice(0, 4) : 'go-live day'
  const closeOfBusiness = goLive ? `${dayMonth(addDays(goLive, -1))}` : 'the day before go-live'

  const parties: Party[] = [
    ...catalog.customers.filter((c) => c.customer_type !== 'one_off').map((c) => ({ id: c.id, kind: 'customer' as const, name: c.name, opening: Number(c.opening_balance), source: c.opening_balance_source, checked: c.opening_balance_checked })),
    ...catalog.suppliers.map((s) => ({ id: s.id, kind: 'supplier' as const, name: s.name, opening: Number(s.opening_balance), source: s.opening_balance_source, checked: s.opening_balance_checked })),
  ]
  // A zero balance needs no checking; anything else needs someone to confirm it against the books.
  const isChecked = (p: Party) => p.opening === 0 || p.checked
  const customerRows = parties.filter((p) => p.kind === 'customer').sort((a, b) => b.opening - a.opening)
  const supplierRows = parties.filter((p) => p.kind === 'supplier').sort((a, b) => b.opening - a.opening)
  const tabs = [`Customers · ${customerRows.length}`, `Suppliers · ${supplierRows.length}`]
  const onCustomers = side.startsWith('Customers')
  const rows = onCustomers ? customerRows : supplierRows
  const pending = parties.filter((p) => !isChecked(p))

  const openingStock = history.adjustments.filter((a) => a.is_opening)
  const activeFlocks = history.flocks.filter((f) => f.status === 'active')
  const staffCount = catalog.profiles.filter((p) => p.is_active && p.role_id).length
  const profileDone = Boolean(settings?.farm_name && settings.address && settings.phone)

  const steps = [
    { title: 'Farm profile', detail: profileDone ? `${settings!.farm_name} · ${settings!.address}` : 'Name, address and phone for receipts', done: profileDone },
    { title: 'Pens & flocks', detail: `${catalog.pens.length} pens · ${activeFlocks.length} flocks with placement dates`, done: catalog.pens.length > 0 && activeFlocks.length > 0 },
    { title: 'Opening stock', detail: openingStock.length ? `${openingStock.length} opening ${openingStock.length === 1 ? 'count' : 'counts'} entered` : 'Feed, eggs and medication in store', done: openingStock.length > 0 },
    { title: 'Opening balances', detail: pending.length ? `${pending.length} still to confirm` : 'What customers and suppliers owed', done: pending.length === 0 },
    { title: 'Staff & roles', detail: `${staffCount} ${staffCount === 1 ? 'person' : 'people'} with a role`, done: staffCount > 1 },
  ]
  const doneCount = steps.filter((s) => s.done).length
  // Open on the first unfinished step, or the review once everything is done.
  const firstOpen = steps.findIndex((s) => !s.done)
  const [step, setStep] = useState(firstOpen === -1 ? steps.length : firstOpen)
  const allSteps = [...steps, { title: 'Review', detail: doneCount === steps.length ? 'Everything is in place' : 'Check totals', done: doneCount === steps.length }]

  async function confirm(p: Party) {
    const db = createClient()
    const { error } = p.kind === 'customer' ? await db.from('customers').update({ opening_balance_checked: true }).eq('id', p.id) : await db.from('suppliers').update({ opening_balance_checked: true }).eq('id', p.id)
    if (error) return toast.error(why(error.message))
    toast.success(`${p.name}’s opening balance confirmed`)
    await reload()
  }

  const columns: Column<Party>[] = [
    { key: 'name', header: onCustomers ? 'Customer' : 'Supplier', render: (r) => <TextCell tone="primary">{r.name}</TextCell> },
    { key: 'opening', header: onCustomers ? 'They owed' : 'We owed', align: 'right', width: 140, render: (r) => <NumberCell>{formatNaira(r.opening)}</NumberCell> },
    { key: 'source', header: 'Source', width: 170, render: (r) => <TextCell tone={r.source ? 'primary' : 'tertiary'}>{r.source ?? '—'}</TextCell> },
    {
      key: 'check',
      header: 'Check',
      width: 120,
      render: (r) =>
        isChecked(r) ? (
          <Badge dot tone="success">
            {r.opening === 0 ? 'Nothing owed' : 'Checked'}
          </Badge>
        ) : editable || can(user, 'parties', 'edit') ? (
          <button type="button" onClick={() => void confirm(r)} className="cursor-pointer">
            <Badge dot tone="warning">
              Confirm
            </Badge>
          </button>
        ) : (
          <Badge dot tone="warning">
            To confirm
          </Badge>
        ),
    },
  ]

  const stockName = (a: (typeof openingStock)[number]) =>
    a.item === 'feed' ? (catalog.feedTypes.find((f) => f.id === a.feed_type_id)?.name ?? 'Feed') : a.item === 'medication' ? (catalog.medications.find((m) => m.id === a.medication_id)?.name ?? 'Medication') : a.item === 'eggs' ? 'Eggs' : 'Cracked eggs'
  const stockUnit = (a: (typeof openingStock)[number]) => (a.item === 'feed' ? 'bags' : a.item === 'medication' ? (catalog.medications.find((m) => m.id === a.medication_id)?.stock_unit ?? '') : 'eggs')

  return (
    <>
      <PageHeader
        backTo="/settings"
        eyebrow={['Settings', 'Go-live setup']}
        title={`Set up ${settings?.farm_name ?? 'the farm'}`}
        description="Done once, on go-live day. It carries the farm’s real starting numbers into the app, so day one is right (probe G15)."
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="w-full shrink-0 lg:w-[300px] gap-1 p-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Steps</h2>
            <span className="type-body-sm text-fg-tertiary">
              {doneCount} of {steps.length} done
            </span>
          </div>
          <ol className="flex flex-col gap-1">
            {allSteps.map((s, i) => {
              const current = i === step
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    onClick={() => setStep(i)}
                    className={cn('flex w-full cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-left', current ? 'bg-brand-subtle' : 'hover:bg-canvas')}
                  >
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full type-label-sm',
                        s.done ? 'bg-brand text-fg-on-brand' : current ? 'border-[1.5px] border-line-brand text-fg-brand' : 'bg-subtle text-fg-tertiary',
                      )}
                    >
                      {s.done ? <Check size={16} strokeWidth={2} /> : i + 1}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="type-body-md text-fg-primary">{s.title}</span>
                      <span className="type-body-sm text-fg-tertiary">{s.detail}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="pt-2 type-body-sm text-fg-secondary">Go-live date: {goLive ? `${dayMonth(goLive)} ${goLive.slice(0, 4)}` : 'not set'}.</p>
        </Card>

        {step === 2 ? (
          <Card className="min-w-0 flex-1 gap-4 p-5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="type-h3 text-fg-primary">Opening stock</h2>
              <span className="type-body-sm text-fg-tertiary">As at {asAt}</span>
            </div>
            <p className="type-body-md text-fg-secondary">Count what is in the store on go-live morning: bags of each feed, eggs, and each medication. Every later figure starts from these counts.</p>
            {openingStock.length > 0 ? (
              <ul className="flex flex-col rounded-lg border border-line">
                {openingStock.map((a) => (
                  <li key={a.id} className="flex h-12 items-center gap-3 border-b border-line-subtle px-4 last:border-b-0">
                    <span className="flex-1 type-body-md text-fg-primary">{stockName(a)}</span>
                    <span className="type-numeric-md text-fg-primary">
                      {formatNumber(Number(a.quantity_change))} {stockUnit(a)}
                    </span>
                    <span className="w-14 text-right type-body-sm text-fg-tertiary">{dayMonth(a.adjusted_on)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-line p-5 type-body-md text-fg-secondary">No opening stock entered yet.</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setStep(1)}>Back</Button>
              {(can(user, 'inventory', 'add') || can(user, 'medication', 'add')) && <Button onClick={() => setAddingStock(true)}>Add opening stock</Button>}
              <Button variant="primary" onClick={() => setStep(3)}>
                Next: Opening balances
              </Button>
            </div>
          </Card>
        ) : step === 3 ? (
          <Card className="min-w-0 flex-1 gap-4 p-5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="type-h3 text-fg-primary">Opening balances</h2>
              <span className="type-body-sm text-fg-tertiary">As at {asAt}</span>
            </div>
            <p className="type-body-md text-fg-secondary">
              Type what each party owed at close of business on {closeOfBusiness}, from the ledger book or WhatsApp records, then confirm it. This is the only balance anyone ever types; everything after it is calculated (BR-4).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl label="Party type" options={tabs} value={onCustomers ? tabs[0] : tabs[1]} onChange={setSide} />
            </div>
            <Table
              columns={columns}
              rows={rows}
              rowKey={(r) => `${r.kind}-${r.id}`}
              rowClassName={(r) => (!isChecked(r) ? 'bg-accent-subtle' : undefined)}
              actionsWidth={48}
              rowActions={can(user, 'parties', 'edit') ? (r) => <RowMenu items={[{ label: 'Edit opening balance', onSelect: () => setEditing(r) }]} /> : undefined}
            />
            <SummaryBox>
              <KeyValueRow label="Customers with a balance">
                {customerRows.filter((r) => r.opening > 0).length} of {customerRows.length}
              </KeyValueRow>
              <KeyValueRow label="Still to confirm">{pending.length ? `${pending.length} (${pending.map((p) => p.name).join(', ')})` : 'None'}</KeyValueRow>
              <KeyValueRow label="Customers owed the farm" calculated>
                {formatNaira(customerRows.reduce((n, r) => n + r.opening, 0))}
              </KeyValueRow>
              <KeyValueRow label="The farm owed suppliers" strong calculated>
                {formatNaira(supplierRows.reduce((n, r) => n + r.opening, 0))}
              </KeyValueRow>
            </SummaryBox>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setStep(2)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(4)}>
                {pending.length ? `Next (${pending.length} to confirm)` : 'Next: Staff & roles'}
              </Button>
            </div>
          </Card>
        ) : step === 5 ? (
          <Card className="min-w-0 flex-1 gap-4 p-5">
            <h2 className="type-h3 text-fg-primary">Review</h2>
            <SummaryBox>
              {steps.map((s) => (
                <KeyValueRow key={s.title} label={s.title}>
                  {s.done ? 'Done' : 'Not finished'} · {s.detail}
                </KeyValueRow>
              ))}
            </SummaryBox>
            <p className="type-body-md text-fg-secondary">
              {doneCount === steps.length ? 'Everything is in place. From here, changes happen in the normal screens and Settings.' : 'Finish the steps that aren’t done. Each one saves as you go, so you can come back any time.'}
            </p>
          </Card>
        ) : (
          <Card className="min-w-0 flex-1 items-center gap-3 p-12 text-center">
            <h2 className="type-h3 text-fg-primary">{steps[step].title}</h2>
            <p className="type-body-md text-fg-secondary">
              {steps[step].done ? 'Done. ' : 'Not finished yet. '}
              {steps[step].detail}.
            </p>
            <Button onClick={() => router.push(['/settings', '/pens', '', '', '/settings/staff'][step])}>{['Open farm profile', 'Open pens & flocks', '', '', 'Open staff'][step]}</Button>
          </Card>
        )}
      </div>
      <Presence>{editing && <OpeningBalanceModal party={editing} onClose={() => setEditing(null)} onSaved={reload} />}</Presence>
      <Presence>{addingStock && <OpeningStockModal goLive={goLive} onClose={() => setAddingStock(false)} onSaved={reload} />}</Presence>
    </>
  )
}

function OpeningBalanceModal({ party, onClose, onSaved }: { party: Party; onClose: () => void; onSaved: () => Promise<void> }) {
  const [amount, setAmount] = useState(String(party.opening))
  const [source, setSource] = useState(party.source ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount.replace(/,/g, ''))
    if (!Number.isFinite(n)) return toast.error('Enter the amount in naira (0 if nothing was owed)')
    setBusy(true)
    // Changing the amount means it needs checking again.
    const patch = { opening_balance: n, opening_balance_source: source.trim() || null, opening_balance_checked: n === party.opening && party.checked }
    const db = createClient()
    const { error } = party.kind === 'customer' ? await db.from('customers').update(patch).eq('id', party.id) : await db.from('suppliers').update(patch).eq('id', party.id)
    setBusy(false)
    if (error) return toast.error(why(error.message))
    toast.success(`${party.name}: opening balance ${formatNaira(n)}`, { description: n !== 0 && !patch.opening_balance_checked ? 'Confirm it once it’s checked against the books.' : undefined })
    onClose()
    await onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Opening balance · ${party.name}`}
      subtitle={party.kind === 'customer' ? 'What they owed the farm at go-live' : 'What the farm owed them at go-live'}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="opening-balance" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="opening-balance" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Amount" hint="Negative if they had paid in advance">
          {(id) => <TextInput id={id} inputMode="decimal" prefix="₦" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="Source" hint="Where the figure came from">
          {(id) => <TextInput id={id} value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Ledger book p. 14" />}
        </Field>
      </form>
    </Modal>
  )
}

function OpeningStockModal({ goLive, onClose, onSaved }: { goLive: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const user = useCurrentUser()
  const { catalog } = useTrade()
  const options = [
    ...(can(user, 'inventory', 'add')
      ? [
          ...catalog.feedTypes.filter((f) => f.is_active).map((f) => ({ value: `feed:${f.id}`, label: `${f.name} · bags` })),
          { value: 'eggs:', label: 'Eggs · counted in eggs' },
          { value: 'cracked_eggs:', label: 'Cracked eggs · counted in eggs' },
        ]
      : []),
    ...(can(user, 'medication', 'add') ? catalog.medications.filter((m) => m.is_active).map((m) => ({ value: `medication:${m.id}`, label: `${m.name} · ${m.stock_unit}` })) : []),
  ]
  const [item, setItem] = useState(options[0]?.value ?? '')
  const [qty, setQty] = useState('')
  const [on, setOn] = useState(goLive ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(qty)
    if (!(n > 0)) return toast.error('Enter how many are in the store')
    const [kind, id] = item.split(':') as [StockItem, string]
    setBusy(true)
    const { error } = await createClient()
      .from('stock_adjustments')
      .insert({
        item: kind,
        feed_type_id: kind === 'feed' ? Number(id) : null,
        medication_id: kind === 'medication' ? Number(id) : null,
        is_opening: true,
        counted_quantity: n,
        quantity_change: n,
        note: 'Opening stock',
        recorded_by: user.id,
        ...(on ? { adjusted_on: on } : {}),
      })
    setBusy(false)
    if (error) return toast.error(why(error.message))
    toast.success('Opening stock added')
    onClose()
    await onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add opening stock"
      subtitle="What was in the store on go-live morning"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="opening-stock" disabled={busy || !item}>
            {busy ? 'Saving…' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="opening-stock" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Item">{(id) => <SelectInput id={id} value={item} onChange={(e) => setItem(e.target.value)} options={options} />}</Field>
        <div className="flex gap-4">
          <Field label="Quantity" className="flex-1">{(id) => <TextInput id={id} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
          <Field label="As at" className="flex-1">{(id) => <TextInput id={id} type="date" value={on} onChange={(e) => setOn(e.target.value)} />}</Field>
        </div>
      </form>
    </Modal>
  )
}
