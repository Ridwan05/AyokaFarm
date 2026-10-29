import { Paperclip, Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import type { Expense, ExpenseCategory } from '../../data/expenses'
import { todayISO, weekdayDayMonth } from '../../data/metrics'
import { pens } from '../../data/pens'
import type { PaymentMethod } from '../../data/sales'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canSeePen, isAttendant } from '../../lib/access'
import { formatNumber } from '../../lib/format'

const SCOPES = ['Whole farm', 'One pen'] as const
const METHODS = ['Cash', 'Transfer', 'POS'] as const
const METHOD_OF = { Cash: 'cash', Transfer: 'transfer', POS: 'POS' } as const
const LABEL_OF: Record<PaymentMethod, (typeof METHODS)[number]> = { cash: 'Cash', transfer: 'Transfer', POS: 'POS' }
const DB_METHOD: Record<PaymentMethod, 'cash' | 'transfer' | 'pos'> = { cash: 'cash', transfer: 'transfer', POS: 'pos' }
const num = (v: string) => Number(v.replace(/,/g, '')) || 0
const MAX_RECEIPT = 10 * 1024 * 1024

/** Add an expense, or correct one (`expense`). Supplier expenses can be part-paid: the rest is owed to them. */
export function AddExpenseModal({ onClose, expense }: { onClose: () => void; expense?: Expense }) {
  const currentUser = useCurrentUser()
  const { addExpense, updateExpense, catalog, suppliers, history } = useTrade()
  const editing = Boolean(expense)
  const categories = catalog.categories.filter((c) => c.is_active || c.name === expense?.category).map((c) => c.name)
  // Attendants add pen expenses only, for the pens they work on (BRD §4); everyone else can pick any pen or the whole farm.
  const ownPensOnly = isAttendant(currentUser.role)
  const penOptions = [...pens].filter((p) => canSeePen(currentUser, p.id)).sort((a, b) => a.id - b.id)
  const toast = useToast()
  const me = currentUser.name.split(' ')[0]
  // A new expense starts from the person's last method, not a sample figure.
  const lastMethod = history.expenses.find((x) => x.recorded_by === currentUser.id)?.payment_method
  const [scope, setScope] = useState<(typeof SCOPES)[number]>(expense ? (expense.pen === null ? 'Whole farm' : 'One pen') : 'One pen')
  const [pen, setPen] = useState(String(expense?.pen ?? penOptions[0]?.id ?? ''))
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? ((categories[0] ?? 'Other') as ExpenseCategory))
  const [amount, setAmount] = useState(expense ? formatNumber(expense.amount) : '')
  const [paid, setPaid] = useState(expense ? formatNumber(expense.amountPaid ?? expense.amount) : '')
  const [paidTouched, setPaidTouched] = useState(editing)
  const [date, setDate] = useState(expense?.date ?? todayISO())
  const [method, setMethod] = useState<(typeof METHODS)[number]>(
    expense?.method ? LABEL_OF[expense.method] : lastMethod === 'cash' ? 'Cash' : lastMethod === 'pos' ? 'POS' : 'Transfer',
  )
  const [supplierId, setSupplierId] = useState(expense?.supplierId ?? '')
  const [description, setDescription] = useState(expense?.description ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const value = num(amount)
  // Without a supplier the expense is paid in full; with one, what's left is owed to them.
  const paidNow = supplierId ? (paidTouched ? num(paid) : value) : value
  const errors = {
    amount: value > 0 ? undefined : 'Enter the amount',
    paid: paidNow > value ? 'More than the amount' : undefined,
    date: date && date <= todayISO() ? undefined : 'Pick a date up to today',
    description: description.trim() ? undefined : 'Say what it was for',
    file: file && file.size > MAX_RECEIPT ? 'The file is over 10 MB' : undefined,
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    const m: PaymentMethod = METHOD_OF[method]
    const penId = scope === 'One pen' ? Number(pen) : null
    setSaving(true)
    let ok: boolean
    if (expense) {
      ok = await updateExpense(
        expense.id,
        {
          spent_on: date,
          category_id: catalog.categories.find((c) => c.name === category)?.id,
          description: description.trim(),
          amount: value,
          amount_paid: paidNow,
          payment_method: DB_METHOD[m],
          pen_id: penId,
          supplier_id: supplierId ? Number(supplierId) : null,
        },
        file,
      )
    } else {
      ok = await addExpense(
        {
          // The database gives it its ref (E-0001).
          id: '',
          date,
          category,
          description: description.trim(),
          pen: penId,
          supplierId: supplierId || null,
          amount: value,
          amountPaid: paidNow,
          method: m,
          receipt: Boolean(file),
          addedBy: me,
        },
        file,
      )
    }
    setSaving(false)
    if (!ok) return
    toast(expense ? `${expense.id} saved` : `${category} · ₦${formatNumber(value)} saved`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? `Correct ${expense.id}` : 'Add expense'}
      subtitle={expense ? `Added by ${expense.addedBy}` : `${weekdayDayMonth(todayISO())} · recorded by ${me}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-expense" disabled={saving}>
            {saving ? 'Saving…' : expense ? 'Save changes' : <>Save<span className="max-sm:hidden"> expense</span>{value ? ` · ₦${formatNumber(value)}` : ''}</>}
          </Button>
        </>
      }
    >
      <form id="add-expense" onSubmit={submit} className="flex flex-col gap-5">
        {!ownPensOnly && <SegmentedControl fullWidth label="Charged to" options={SCOPES} value={scope} onChange={setScope} />}
        {scope === 'One pen' ? (
          <Field label="Pen" hint={ownPensOnly ? `Charged to Pen ${pen} — you can add expenses for your own pens` : `Charged to Pen ${pen} only`}>
            {(id) => (
              <SelectInput
                id={id}
                value={pen}
                onChange={(e) => setPen(e.target.value)}
                options={penOptions.map((p) => ({ value: String(p.id), label: `Pen ${p.id} · ${p.type}` }))}
              />
            )}
          </Field>
        ) : (
          <p className="-mt-2 type-body-sm text-fg-secondary">Shared across all pens by bird-days.</p>
        )}
        <Field label="Category" hint="Medication from the store is a purchase, not an expense">
          {(id) => (
            <SelectInput
              id={id}
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              options={categories.map((c) => ({ value: c, label: c }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label="Amount" className="flex-1" error={submitted ? errors.amount : undefined}>
            {(id) => (
              <TextInput id={id} prefix="₦" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => value && setAmount(formatNumber(value))} />
            )}
          </Field>
          <Field label="Date" className="flex-1" error={submitted ? errors.date : undefined}>
            {(id) => <DateInput id={id} value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        {/* Attendants' pen expenses have no supplier (the database refuses one for them). */}
        {!ownPensOnly && (
          <Field label="Supplier" hint={supplierId ? 'Anything not paid now is owed to them' : 'Optional — for equipment or services bought from a supplier'}>
            {(id) => (
              <SelectInput
                id={id}
                leadingIcon={Store}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                options={[{ value: '', label: 'No supplier' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
              />
            )}
          </Field>
        )}
        {supplierId && (
          <Field label="Amount paid now" hint={value - paidNow > 0 ? `₦${formatNumber(value - paidNow)} owed to the supplier` : 'Paid in full'} error={submitted ? errors.paid : undefined}>
            {(id) => (
              <TextInput
                id={id}
                prefix="₦"
                inputMode="numeric"
                value={paidTouched ? paid : formatNumber(value)}
                onChange={(e) => {
                  setPaidTouched(true)
                  setPaid(e.target.value)
                }}
                onBlur={() => setPaid(formatNumber(num(paid)))}
              />
            )}
          </Field>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="type-label-md text-fg-primary">Paid how?</span>
          <SegmentedControl fullWidth label="Paid how" options={METHODS} value={method} onChange={setMethod} />
        </div>
        <Field label="What was it for?" hint="Shows on the expense and in reports" error={submitted ? errors.description : undefined}>
          {(id) => (
            <TextInput
              id={id}
              placeholder="Vet visit — Pen 2 sneezing, water line checked"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={expense?.receiptPath ? 'Replace the receipt' : 'Receipt'}
          hint={file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : 'Optional · photo or PDF, up to 10 MB'}
          error={submitted ? errors.file : undefined}
        >
          {(id) => (
            <label htmlFor={id} className="flex h-12 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-3 type-body-md text-fg-secondary hover:bg-subtle">
              <Paperclip size={18} strokeWidth={1.5} className="shrink-0 text-icon-secondary" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{file ? file.name : 'Take a photo or choose a file'}</span>
              <input id={id} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </Field>
      </form>
    </Modal>
  )
}
