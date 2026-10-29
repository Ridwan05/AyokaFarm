import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import type { FinanceEntry, useFinance } from '../../data/finance'
import { farmSettings } from '../../data/farmSettings'
import { todayISO } from '../../data/metrics'
import { formatNumber } from '../../lib/format'
import { ENTRY_KINDS, KIND_LABEL, num } from './financeView'

type Kind = (typeof ENTRY_KINDS)[number]
const isLoan = (k: Kind) => k === 'loan_received' || k === 'loan_repaid'

const HINT: Record<Kind, string> = {
  capital_in: 'Money the owner put into the farm. It adds to cash or bank and to owner’s capital.',
  drawing: 'Money the owner took out for personal use. It comes off cash or bank and off owner’s capital.',
  loan_received: 'Money borrowed from a bank, cooperative or partner. It adds to cash or bank and is owed back.',
  loan_repaid: 'Money paid back on a loan. It comes off cash or bank and off what’s owed.',
  other_income: 'Money in that isn’t a sale, e.g. a grant or rent. It counts as income on the Income Statement.',
}

type Props = {
  entry?: FinanceEntry
  /** Starting values for a new entry, e.g. a loan owed at go-live. */
  defaults?: { kind?: Kind; date?: string }
  lenders: string[]
  save: ReturnType<typeof useFinance>['save']
  onClose: () => void
  since: string
}

/** Record (or edit) owner's capital, a drawing, a loan, a loan repayment or other income. */
export function EntryModal({ entry, defaults, lenders, save, onClose, since }: Props) {
  const toast = useToast()
  const [kind, setKind] = useState<Kind>(entry && entry.kind !== 'opening_cash' ? entry.kind : (defaults?.kind ?? 'capital_in'))
  const [date, setDate] = useState(entry?.entry_on ?? defaults?.date ?? todayISO())
  const [amount, setAmount] = useState(entry ? formatNumber(Number(entry.amount)) : '')
  const [account, setAccount] = useState<'Cash' | 'Bank'>(entry?.account === 'cash' ? 'Cash' : 'Bank')
  const [lender, setLender] = useState(entry?.counterparty ?? '')
  const [term, setTerm] = useState<'Within a year' | 'Longer'>(entry?.loan_term === 'long' ? 'Longer' : 'Within a year')
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const goLive = farmSettings.goLiveDate ?? since

  const errors = {
    amount: num(amount) > 0 ? undefined : 'Enter an amount',
    lender: !isLoan(kind) || lender.trim() ? undefined : 'Who lent the money?',
    date: date <= todayISO() ? undefined : 'Can’t be in the future',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    setSaving(true)
    const row = {
      kind,
      entry_on: date,
      amount: num(amount),
      account: account.toLowerCase(),
      counterparty: isLoan(kind) ? lender.trim() : lender.trim() || null,
      loan_term: isLoan(kind) ? (term === 'Longer' ? 'long' : 'short') : null,
      notes: notes.trim() || null,
    }
    const ok = await save((db) => (entry ? db.from('finance_entries').update(row).eq('id', entry.id) : db.from('finance_entries').insert(row)))
    setSaving(false)
    if (!ok) return
    toast(entry ? `${entry.ref} saved` : `${KIND_LABEL[kind]} recorded`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? `Edit ${entry.ref}` : 'Record capital, a loan or other income'}
      subtitle="Money in or out that isn’t a sale, purchase, expense or pay."
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="finance-entry" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="finance-entry" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="What happened" hint={HINT[kind]}>
          {(id) => <SelectInput id={id} value={kind} onChange={(e) => setKind(e.target.value as Kind)} options={ENTRY_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Date"
            error={submitted ? errors.date : undefined}
            hint={kind === 'loan_received' && date < goLive ? 'Before go-live: counted as owed at go-live, not as cash received' : undefined}
          >
            {(id) => <TextInput id={id} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Amount" error={submitted ? errors.amount : undefined}>
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={() => num(amount) && setAmount(formatNumber(num(amount)))} />}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="type-label-md text-fg-primary">{kind === 'drawing' || kind === 'loan_repaid' ? 'Paid from' : 'Paid into'}</span>
          <SegmentedControl fullWidth label="Account" options={['Cash', 'Bank'] as const} value={account} onChange={setAccount} />
        </div>
        {isLoan(kind) ? (
          <>
            <Field label="Lender" hint="Bank, cooperative or partner" error={submitted ? errors.lender : undefined}>
              {(id) => (
                <>
                  <TextInput id={id} list="finance-lenders" value={lender} onChange={(e) => setLender(e.target.value)} />
                  <datalist id="finance-lenders">
                    {lenders.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <div className="flex flex-col gap-2">
              <span className="type-label-md text-fg-primary">Due to be paid back</span>
              <SegmentedControl fullWidth label="Due to be paid back" options={['Within a year', 'Longer'] as const} value={term} onChange={setTerm} />
              <p className="type-body-sm text-fg-tertiary">Within a year is a current liability on the Balance Sheet; longer is a long-term loan.</p>
            </div>
          </>
        ) : (
          <Field label={kind === 'other_income' ? 'From' : 'Who'}>{(id) => <TextInput id={id} value={lender} onChange={(e) => setLender(e.target.value)} />}</Field>
        )}
        <Field label="Notes">{(id) => <TextInput id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      </form>
    </Modal>
  )
}

