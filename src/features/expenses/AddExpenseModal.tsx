import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Checkbox, DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { expenseCategories, type Expense, type ExpenseCategory } from '../../data/expenses'
import { TODAY_ISO } from '../../data/ledger'
import { pens } from '../../data/pens'
import type { PaymentMethod } from '../../data/sales'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canSeePen } from '../../lib/access'
import { formatNumber } from '../../lib/format'

const SCOPES = ['Whole farm', 'One pen'] as const
const METHODS = ['Cash', 'Transfer', 'POS'] as const

export function AddExpenseModal({ onClose }: { onClose: () => void }) {
  const currentUser = useCurrentUser()
  const { addExpense } = useTrade()
  // Pen attendants add expenses for their own pens only (BRD §4); everyone else can pick any pen or the whole farm.
  const ownPensOnly = currentUser.pens !== 'all'
  const penOptions = [...pens].filter((p) => canSeePen(currentUser, p.id)).sort((a, b) => a.id - b.id)
  const toast = useToast()
  const me = currentUser.name.split(' ')[0]
  const [scope, setScope] = useState<(typeof SCOPES)[number]>('One pen')
  const [pen, setPen] = useState(String(penOptions[0]?.id ?? ''))
  const [category, setCategory] = useState<ExpenseCategory>('Vet services')
  const [amount, setAmount] = useState('25,000')
  const [date, setDate] = useState(TODAY_ISO)
  const [method, setMethod] = useState<(typeof METHODS)[number]>('Transfer')
  const [description, setDescription] = useState('')
  const [receipt, setReceipt] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const value = Number(amount.replace(/,/g, '')) || 0
  const errors = {
    amount: value > 0 ? undefined : 'Enter the amount',
    description: description.trim() ? undefined : 'Say what it was for',
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.amount || errors.description) return
    const m: PaymentMethod = method === 'POS' ? 'POS' : method === 'Cash' ? 'cash' : 'transfer'
    const expense: Expense = {
      id: `e${Date.now()}`,
      date,
      category,
      description: description.trim(),
      pen: scope === 'One pen' ? Number(pen) : null,
      supplierId: null,
      amount: value,
      method: m,
      receipt,
      addedBy: me,
    }
    addExpense(expense)
    toast(`${category} · ₦${formatNumber(value)} saved`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add expense"
      subtitle={`Fri 09/10/2026 · recorded by ${me}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-expense">
            Save<span className="max-sm:hidden"> expense</span> · ₦{formatNumber(value)}
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
              options={expenseCategories.map((c) => ({ value: c, label: c }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label="Amount" className="flex-1" error={submitted ? errors.amount : undefined}>
            {(id) => (
              <TextInput id={id} prefix="₦" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => setAmount(formatNumber(value))} />
            )}
          </Field>
          <Field label="Date" className="flex-1">
            {(id) => <DateInput id={id} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
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
        <Checkbox label="Receipt photo attached" checked={receipt} onChange={setReceipt} />
      </form>
    </Modal>
  )
}
