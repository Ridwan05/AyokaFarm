'use client'

import { ChevronRight, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { RowMenu } from '../../components/ui/Menu'
import { Modal, Presence } from '../../components/ui/Overlay'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { STATEMENT_LINES, type StatementLine } from '../../data/finance'
import { dm, staffWithRole } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canEditSettings } from '../../lib/access'
import { cn } from '../../lib/cn'
import { formatNaira } from '../../lib/format'
import { createClient } from '../../lib/supabase/client'
import type { Database, Tables } from '../../lib/supabase/database.types'
import { SettingsHeader } from './SettingsHeader'

type Product = Tables<'products'> & { last: string }
type Medication = Tables<'medications'>
type ListId = 'products' | 'expense-categories' | 'medications' | 'adjust-reasons' | 'payment-methods' | 'customer-types'
/** The simple name lists, and their tables. */
const NAME_TABLES = { 'expense-categories': 'expense_categories', 'adjust-reasons': 'adjustment_reasons' } as const
type NameListId = keyof typeof NAME_TABLES

const PRODUCT_KINDS: { value: Database['public']['Enums']['product_kind']; label: string }[] = [
  { value: 'eggs', label: 'Eggs' },
  { value: 'birds', label: 'Birds' },
  { value: 'droppings', label: 'Droppings' },
  { value: 'sacks', label: 'Empty sacks' },
]
const MED_CATEGORIES: Database['public']['Enums']['medication_category'][] = ['vaccine', 'antibiotic', 'vitamin', 'dewormer', 'coccidiostat', 'disinfectant', 'other']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const why = (message: string) => (/row-level security|permission/i.test(message) ? 'Only the owner can change lists.' : /duplicate key/i.test(message) ? 'That name is already on the list.' : message)

export default function Lists() {
  const user = useCurrentUser()
  const { catalog, history, reload } = useTrade()
  const editable = canEditSettings(user)
  const [selected, setSelected] = useState<ListId>('products')
  const [editing, setEditing] = useState<
    | { kind: 'name'; list: NameListId; item: { id: number; name: string } | null }
    | { kind: 'product'; item: Product | null }
    | { kind: 'medication'; item: Medication | null }
    | null
  >(null)

  // Latest price each product sold at.
  const lastSale = new Map<number, Tables<'sales'>>()
  for (const s of [...history.sales].filter((x) => x.approval === 'approved').sort((a, b) => b.sold_on.localeCompare(a.sold_on))) if (!lastSale.has(s.product_id)) lastSale.set(s.product_id, s)
  const products: Product[] = catalog.products.map((p) => {
    const s = lastSale.get(p.id)
    return { ...p, last: s ? `${formatNaira(Number(s.unit_price))} · ${dm(s.sold_on)}` : '—' }
  })
  const approvers = [...staffWithRole(catalog, 'farm_manager'), ...staffWithRole(catalog, 'owner')]

  const lists: { id: ListId; name: string; summary: string; description: string }[] = [
    { id: 'products', name: 'Products & minimum prices', summary: `${catalog.products.filter((p) => p.is_active).length} products`, description: '' },
    { id: 'expense-categories', name: 'Expense categories', summary: `${catalog.categories.filter((c) => c.is_active).length} categories`, description: 'Used by Add expense. Medication and feed are purchases, so they aren’t listed here. The statement line says where each category’s expenses go on the Income Statement.' },
    { id: 'medications', name: 'Medication list', summary: `${catalog.medications.filter((m) => m.is_active).length} medications`, description: 'Each medication’s withdrawal period drives the egg and bird sale warnings.' },
    { id: 'adjust-reasons', name: 'Stock-adjustment reasons', summary: `${catalog.reasons.filter((r) => r.is_active).length} reasons`, description: 'A count can only change stock with one of these reasons.' },
    { id: 'payment-methods', name: 'Payment methods', summary: 'Cash · Transfer · POS', description: 'Shown on every payment, sale and purchase. These are fixed: the reports and statements group by them.' },
    { id: 'customer-types', name: 'Customer types', summary: 'Regular · One-off', description: 'Regular customers get a running statement; one-off buyers pay in full. These are fixed.' },
  ]
  const list = lists.find((l) => l.id === selected)!
  const db = createClient()

  async function toggle(table: 'products' | 'expense_categories' | 'adjustment_reasons' | 'medications', id: number, name: string, active: boolean) {
    const { error } = await db.from(table).update({ is_active: active }).eq('id', id)
    if (error) return toast.error(why(error.message))
    toast.success(active ? `${name} is back on new forms` : `${name} hidden from new forms`, { description: active ? undefined : 'Old records keep it.' })
    await reload()
  }

  /** Where an expense category goes on the Income Statement. */
  async function setStatementLine(id: number, name: string, line: StatementLine) {
    const { error } = await db.from('expense_categories').update({ statement_line: line }).eq('id', id)
    if (error) return toast.error(why(error.message))
    toast.success(`${name} now goes under ${STATEMENT_LINES[line]}`)
    await reload()
  }
  const lineOf = (id: number) => ((catalog.categories.find((c) => c.id === id) as { statement_line?: string } | undefined)?.statement_line ?? 'misc') as StatementLine

  const priceColumns: Column<Product>[] = [
    { key: 'name', header: 'Product', render: (p) => <TextCell tone="primary">{p.name}</TextCell> },
    { key: 'unit', header: 'Unit', align: 'right', width: 90, render: (p) => <TextCell tone="primary">{p.unit}</TextCell> },
    { key: 'min', header: 'Minimum price', align: 'right', width: 130, render: (p) => <NumberCell>{p.min_price === null ? '—' : formatNaira(Number(p.min_price))}</NumberCell> },
    { key: 'last', header: 'Last price', width: 150, render: (p) => <TextCell>{p.last}</TextCell> },
    {
      key: 'status',
      header: 'Status',
      width: 100,
      render: (p) => (
        <Badge dot tone={p.is_active ? 'success' : 'neutral'}>
          {p.is_active ? 'Active' : 'Hidden'}
        </Badge>
      ),
    },
  ]

  const nameItems: { id: number; name: string; is_active: boolean; detail?: string }[] =
    selected === 'expense-categories'
      ? catalog.categories
      : selected === 'adjust-reasons'
        ? catalog.reasons
        : selected === 'medications'
          ? catalog.medications.map((m) => ({ ...m, detail: m.category === 'disinfectant' ? 'Disinfectant · not given to birds' : `${m.withdrawal_days ?? 0} days withdrawal · ${m.stock_unit}` }))
          : selected === 'payment-methods'
            ? ['Cash', 'Transfer', 'POS'].map((name, id) => ({ id, name, is_active: true }))
            : selected === 'customer-types'
              ? ['Regular', 'One-off'].map((name, id) => ({ id, name, is_active: true }))
              : []
  const fixed = selected === 'payment-methods' || selected === 'customer-types'

  return (
    <>
      <SettingsHeader title="Lists" description="The pick-lists every form uses. Change one here and everyone gets the new list the next time the app loads." />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="w-full shrink-0 lg:w-[300px] gap-1 p-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Lists</h2>
            <span className="type-body-sm text-fg-tertiary">{lists.length}</span>
          </div>
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelected(l.id)}
              className={cn('flex cursor-pointer items-center rounded-md px-3 py-2.5 text-left', l.id === selected ? 'bg-subtle' : 'hover:bg-canvas')}
            >
              <span className="flex flex-1 flex-col">
                <span className="type-body-md text-fg-primary">{l.name}</span>
                <span className="type-body-sm text-fg-tertiary">{l.summary}</span>
              </span>
              <ChevronRight size={16} strokeWidth={1.5} className="text-icon-secondary" />
            </button>
          ))}
          <p className="pt-2 type-body-sm text-fg-secondary">Hiding an item takes it off new forms; old records keep it.</p>
        </Card>

        <Card className="min-w-0 flex-1 gap-4 p-5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="type-h3 text-fg-primary">{list.name}</h2>
            <span className="type-body-sm text-fg-tertiary">{list.id === 'products' ? `${list.summary} · used by Record sale` : list.summary}</span>
          </div>
          {list.id === 'products' ? (
            <>
              <p className="type-body-md text-fg-secondary">
                Selling under the minimum waits for a manager’s approval{approvers.length ? ` (${approvers.join(' or ')})` : ''} — the sale is saved as Pending until then (FR-SAL-5). Sales staff see the minimum on the sale form.
                New prices apply to new sales only; old receipts keep theirs.
              </p>
              <Table
                columns={priceColumns}
                rows={products}
                rowKey={(p) => String(p.id)}
                actionsWidth={48}
                rowActions={
                  editable
                    ? (p) => (
                        <RowMenu
                          items={[
                            { label: 'Change minimum', onSelect: () => setEditing({ kind: 'product', item: p }) },
                            p.is_active ? { label: 'Hide from new sales', danger: true, onSelect: () => void toggle('products', p.id, p.name, false) } : { label: 'Show on new sales', onSelect: () => void toggle('products', p.id, p.name, true) },
                          ]}
                        />
                      )
                    : undefined
                }
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="flex-1 type-body-sm text-fg-secondary">Price changes are logged in the audit log with your name.</span>
                {editable && (
                  <Button variant="ghost" leadingIcon={Plus} onClick={() => setEditing({ kind: 'product', item: null })}>
                    Add product
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="type-body-md text-fg-secondary">{list.description}</p>
              <ul className="flex flex-col">
                {nameItems.map((item) => (
                  <li key={item.id} className="flex min-h-12 items-center gap-2 border-b border-line-subtle py-1 last:border-b-0">
                    <span className={cn('min-w-0 flex-1 type-body-md', item.is_active ? 'text-fg-primary' : 'text-fg-tertiary')}>{item.name}</span>
                    {!item.is_active && <Badge tone="neutral">Hidden</Badge>}
                    {item.detail && <span className="hidden pr-2 type-body-sm text-fg-tertiary sm:inline">{item.detail}</span>}
                    {selected === 'expense-categories' &&
                      (editable ? (
                        <SelectInput
                          aria-label={`Statement line for ${item.name}`}
                          size="md"
                          className="w-[170px] shrink-0 sm:w-[220px]"
                          value={lineOf(item.id)}
                          onChange={(e) => void setStatementLine(item.id, item.name, e.target.value as StatementLine)}
                          options={Object.entries(STATEMENT_LINES).map(([value, label]) => ({ value, label }))}
                        />
                      ) : (
                        <span className="pr-2 type-body-sm text-fg-tertiary">{STATEMENT_LINES[lineOf(item.id)]}</span>
                      ))}
                    {editable && !fixed && (
                      <RowMenu
                        items={[
                          {
                            label: selected === 'medications' ? 'Edit' : 'Rename',
                            onSelect: () =>
                              selected === 'medications'
                                ? setEditing({ kind: 'medication', item: catalog.medications.find((m) => m.id === item.id)! })
                                : setEditing({ kind: 'name', list: selected as NameListId, item }),
                          },
                          item.is_active
                            ? { label: 'Hide from new forms', danger: true, onSelect: () => void toggle(selected === 'medications' ? 'medications' : NAME_TABLES[selected as NameListId], item.id, item.name, false) }
                            : { label: 'Show on new forms', onSelect: () => void toggle(selected === 'medications' ? 'medications' : NAME_TABLES[selected as NameListId], item.id, item.name, true) },
                        ]}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {editable && !fixed && (
                <Button
                  variant="ghost"
                  leadingIcon={Plus}
                  className="self-start"
                  onClick={() => (selected === 'medications' ? setEditing({ kind: 'medication', item: null }) : setEditing({ kind: 'name', list: selected as NameListId, item: null }))}
                >
                  Add item
                </Button>
              )}
            </>
          )}
        </Card>
      </div>
      <Presence>
        {editing?.kind === 'name' && (
          <NameModal
            table={NAME_TABLES[editing.list]}
            listName={lists.find((l) => l.id === editing.list)!.name}
            item={editing.item}
            taken={(editing.list === 'expense-categories' ? catalog.categories : catalog.reasons).map((x) => x.name)}
            onClose={() => setEditing(null)}
            onSaved={reload}
          />
        )}
      </Presence>
      <Presence>{editing?.kind === 'product' && <ProductModal product={editing.item} onClose={() => setEditing(null)} onSaved={reload} />}</Presence>
      <Presence>{editing?.kind === 'medication' && <MedicationModal medication={editing.item} onClose={() => setEditing(null)} onSaved={reload} />}</Presence>
    </>
  )
}

function Footer({ onClose, form, busy, label }: { onClose: () => void; form: string; busy: boolean; label: string }) {
  return (
    <>
      <Button size="lg" className="flex-1" onClick={onClose}>
        Cancel
      </Button>
      <Button size="lg" variant="primary" className="flex-1" type="submit" form={form} disabled={busy}>
        {busy ? 'Saving…' : label}
      </Button>
    </>
  )
}

function NameModal({
  table,
  listName,
  item,
  taken,
  onClose,
  onSaved,
}: {
  table: 'expense_categories' | 'adjustment_reasons'
  listName: string
  item: { id: number; name: string } | null
  taken: string[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return toast.error('Enter a name')
    if (taken.some((t) => t.toLowerCase() === n.toLowerCase() && t !== item?.name)) return toast.error('That name is already on the list')
    setBusy(true)
    const db = createClient()
    const { error } = item ? await db.from(table).update({ name: n }).eq('id', item.id) : await db.from(table).insert({ name: n })
    setBusy(false)
    if (error) return toast.error(why(error.message))
    toast.success(item ? `Renamed to ${n}` : `${n} added`, { description: item ? 'Old records show the new name too.' : undefined })
    onClose()
    await onSaved()
  }

  return (
    <Modal open onClose={onClose} title={item ? `Rename ${item.name}` : 'Add item'} subtitle={listName} footer={<Footer onClose={onClose} form="list-item" busy={busy} label={item ? 'Rename' : 'Add'} />}>
      <form id="list-item" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      </form>
    </Modal>
  )
}

function ProductModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { settings } = useTrade()
  const [name, setName] = useState(product?.name ?? '')
  const [kind, setKind] = useState<(typeof PRODUCT_KINDS)[number]['value']>(product?.kind ?? 'eggs')
  const [unit, setUnit] = useState(product?.unit ?? 'crate')
  const [min, setMin] = useState(product?.min_price === null || product?.min_price === undefined ? '' : String(Number(product.min_price)))
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const price = min.trim() ? Number(min) : null
    if (price !== null && !(price >= 0)) return toast.error('Enter the minimum price in naira, or leave it blank for no minimum')
    const db = createClient()
    setBusy(true)
    let error
    if (product) {
      ;({ error } = await db.from('products').update({ min_price: price }).eq('id', product.id))
    } else {
      if (!name.trim() || !unit.trim()) {
        setBusy(false)
        return toast.error('Enter the product name and unit')
      }
      // Whole eggs come out of the egg store by the crate; other products aren't stock-tracked.
      const eggs = kind === 'eggs'
      ;({ error } = await db.from('products').insert({ name: name.trim(), kind, unit: unit.trim(), min_price: price, stock_item: eggs ? 'eggs' : null, stock_units_per_unit: eggs ? (settings?.eggs_per_crate ?? 30) : null }))
    }
    setBusy(false)
    if (error) return toast.error(why(error.message))
    toast.success(product ? `${product.name}: minimum ${price === null ? 'removed' : formatNaira(price)}` : `${name.trim()} added`)
    onClose()
    await onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? `Minimum price · ${product.name}` : 'Add product'}
      subtitle={product ? 'Applies to new sales only' : 'It appears on Record sale straight away'}
      footer={<Footer onClose={onClose} form="product" busy={busy} label={product ? 'Save minimum' : 'Add product'} />}
    >
      <form id="product" onSubmit={submit} className="flex flex-col gap-4">
        {!product && (
          <>
            <Field label="Name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Point-of-lay pullets" />}</Field>
            <div className="flex gap-4">
              <Field label="Kind" className="flex-1">{(id) => <SelectInput id={id} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} options={PRODUCT_KINDS} />}</Field>
              <Field label="Sold by the" className="flex-1">{(id) => <TextInput id={id} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="crate, bird, bag" />}</Field>
            </div>
          </>
        )}
        <Field label="Minimum price" hint="Below this, a sale waits for a manager’s approval. Blank = no minimum.">
          {(id) => <TextInput id={id} inputMode="numeric" prefix="₦" value={min} onChange={(e) => setMin(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}

function MedicationModal({ medication, onClose, onSaved }: { medication: Medication | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(medication?.name ?? '')
  const [category, setCategory] = useState(medication?.category ?? 'vitamin')
  const [unit, setUnit] = useState(medication?.stock_unit ?? 'g')
  const [withdrawal, setWithdrawal] = useState(String(medication?.withdrawal_days ?? 0))
  const [reorder, setReorder] = useState(String(medication ? Number(medication.reorder_level) : 0))
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !unit.trim()) return toast.error('Enter the name and the unit it’s counted in')
    const days = Number(withdrawal)
    if (!Number.isInteger(days) || days < 0) return toast.error('Withdrawal must be whole days (0 if none)')
    if (!(Number(reorder) >= 0)) return toast.error('Enter the reorder level')
    setBusy(true)
    const row = { name: name.trim(), category, stock_unit: unit.trim(), withdrawal_days: category === 'disinfectant' ? null : days, reorder_level: Number(reorder) }
    const db = createClient()
    const { error } = medication ? await db.from('medications').update(row).eq('id', medication.id) : await db.from('medications').insert(row)
    setBusy(false)
    if (error) return toast.error(why(error.message))
    toast.success(medication ? `${row.name} updated` : `${row.name} added`)
    onClose()
    await onSaved()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={medication ? `Edit ${medication.name}` : 'Add medication'}
      subtitle="The withdrawal period sets when eggs and birds can be sold after a dose"
      footer={<Footer onClose={onClose} form="medication" busy={busy} label={medication ? 'Save' : 'Add medication'} />}
    >
      <form id="medication" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="flex gap-4">
          <Field label="Category" className="flex-1">{(id) => <SelectInput id={id} value={category} onChange={(e) => setCategory(e.target.value as typeof category)} options={MED_CATEGORIES.map((c) => ({ value: c, label: cap(c) }))} />}</Field>
          <Field label="Counted in" hint="g, ml, vials, doses" className="flex-1">{(id) => <TextInput id={id} value={unit} onChange={(e) => setUnit(e.target.value)} />}</Field>
        </div>
        <div className="flex gap-4">
          <Field label="Withdrawal" className="flex-1">{(id) => <TextInput id={id} inputMode="numeric" value={withdrawal} disabled={category === 'disinfectant'} onChange={(e) => setWithdrawal(e.target.value)} suffix="days" />}</Field>
          <Field label="Reorder at" className="flex-1">{(id) => <TextInput id={id} inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} suffix={unit} />}</Field>
        </div>
      </form>
    </Modal>
  )
}
