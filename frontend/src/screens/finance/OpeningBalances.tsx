'use client'

import { ArrowRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Presence } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { farmSettings } from '../../data/farmSettings'
import { openingDate, useFinance } from '../../data/finance'
import { dayMonth } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { EntryModal } from '../../features/finance/EntryModal'
import { num, openingDay } from '../../features/finance/financeView'
import { FinanceState, FinanceTabs } from '../../features/finance/FinanceTabs'
import { can } from '../../lib/access'
import { formatNaira, formatNumber } from '../../lib/format'

// Finance → Opening balances: the cash, bank and loans the farm had at go-live. Everything after is
// worked out from the records; the Balance Sheet starts from these.

const fullDate = (iso: string) => `${dayMonth(iso)} ${iso.slice(0, 4)}`

export default function OpeningBalances() {
  const user = useCurrentUser()
  const toast = useToast()
  const { history, catalog } = useTrade()
  const { data, loaded, error, reload, save } = useFinance()
  const [addingLoan, setAddingLoan] = useState(false)
  const goLive = openingDate(history)
  const day = openingDay(goLive)
  const canEdit = can(user, 'finance', 'edit') && can(user, 'finance', 'add')

  const opening = (account: 'cash' | 'bank') => data.entries.find((e) => e.kind === 'opening_cash' && e.account === account)
  const loansAtGoLive = data.entries.filter((e) => (e.kind === 'loan_received' || e.kind === 'loan_repaid') && e.entry_on < goLive)
  const owedAtGoLive = loansAtGoLive.reduce((n, e) => n + (e.kind === 'loan_received' ? 1 : -1) * Number(e.amount), 0)
  const customersOwed = catalog.customers.reduce((n, c) => n + Number(c.opening_balance), 0)
  const suppliersOwed = catalog.suppliers.reduce((n, s) => n + Number(s.opening_balance), 0)
  const openingStock = history.adjustments.filter((a) => a.is_opening).length
  const lenders = [...new Set(data.entries.map((e) => e.counterparty).filter((x): x is string => Boolean(x)))]

  return (
    <>
      <PageHeader
        eyebrow={['Insight', 'Finance']}
        title="Opening balances"
        description={`What the farm had and owed at go-live (${fullDate(goLive)}). The Balance Sheet starts from here and adds everything recorded since.`}
      />
      <FinanceTabs />
      {!farmSettings.goLiveDate && (
        <Alert tone="warning" title="Go-live date not set">
          Set it in Settings → Farm profile. Until then, the records start on {fullDate(goLive)}.
        </Alert>
      )}
      {!loaded ? (
        <FinanceState error={error} onRetry={() => void reload()} />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <CashCard
              key={`${opening('cash')?.id}-${opening('cash')?.amount}-${opening('bank')?.id}-${opening('bank')?.amount}`}
              cash={opening('cash')}
              bank={opening('bank')}
              day={day}
              canEdit={canEdit}
              save={save}
              onSaved={() => toast('Opening cash and bank saved')}
            />
            <Card className="gap-1 px-5 pt-4 pb-5">
              <div className="flex items-center gap-2 pb-2">
                <h2 className="flex-1 type-h3 text-fg-primary">Loans owed at go-live</h2>
                {canEdit && (
                  <Button size="sm" leadingIcon={Plus} onClick={() => setAddingLoan(true)}>
                    Add loan
                  </Button>
                )}
              </div>
              <p className="pb-2 type-body-sm text-fg-tertiary">
                Loans dated before go-live count as owed at go-live, not as money received after it. Repayments since go-live are recorded under Capital & loans.
              </p>
              {loansAtGoLive.length ? (
                <>
                  {loansAtGoLive.map((e) => (
                    <KeyValueRow key={e.id} label={`${e.counterparty} · ${e.loan_term === 'long' ? 'long-term' : 'within a year'}`}>
                      {e.kind === 'loan_repaid' ? '−' : ''}
                      {formatNaira(Number(e.amount))}
                    </KeyValueRow>
                  ))}
                  <KeyValueRow label="Owed at go-live" strong calculated="Loans dated before go-live − repayments dated before go-live.">
                    {formatNaira(owedAtGoLive)}
                  </KeyValueRow>
                </>
              ) : (
                <p className="type-body-md text-fg-tertiary">No loans owed at go-live.</p>
              )}
            </Card>
          </div>
          <Card className="w-full shrink-0 gap-1 px-5 pt-4 pb-5 lg:w-[380px]">
            <h2 className="pb-2 type-h3 text-fg-primary">Set elsewhere</h2>
            <KeyValueRow label="Customers owed the farm" calculated="Customer opening balances (Settings → Go-live setup).">
              {formatNaira(customersOwed)}
            </KeyValueRow>
            <KeyValueRow label="Owed to suppliers" calculated="Supplier opening balances (Settings → Go-live setup).">
              {formatNaira(suppliersOwed)}
            </KeyValueRow>
            <KeyValueRow label="Opening stock counts">{formatNumber(openingStock)} entries</KeyValueRow>
            <Link href="/go-live" className="mt-2 inline-flex items-center gap-1.5 type-label-md text-fg-brand hover:underline">
              Open go-live setup <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
            <Link href="/finance" className="inline-flex items-center gap-1.5 type-label-md text-fg-brand hover:underline">
              Assets owned at go-live: Fixed assets <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </Card>
        </div>
      )}
      <Presence>
        {addingLoan && <EntryModal defaults={{ kind: 'loan_received', date: day }} lenders={lenders} save={save} since={history.since} onClose={() => setAddingLoan(false)} />}
      </Presence>
    </>
  )
}

type Entry = ReturnType<typeof useFinance>['data']['entries'][number]

function CashCard({ cash, bank, day, canEdit, save, onSaved }: { cash?: Entry; bank?: Entry; day: string; canEdit: boolean; save: ReturnType<typeof useFinance>['save']; onSaved: () => void }) {
  const [cashText, setCashText] = useState(cash ? formatNumber(Number(cash.amount)) : '')
  const [bankText, setBankText] = useState(bank ? formatNumber(Number(bank.amount)) : '')
  const [saving, setSaving] = useState(false)

  /** Upsert (or remove, when cleared) the opening entry for one account. */
  const saveOne = (account: 'cash' | 'bank', existing: Entry | undefined, text: string) => {
    const amount = num(text)
    if (existing && amount <= 0) return save((db) => db.from('finance_entries').delete().eq('id', existing.id))
    if (existing) return save((db) => db.from('finance_entries').update({ amount, entry_on: day }).eq('id', existing.id))
    if (amount > 0) return save((db) => db.from('finance_entries').insert({ kind: 'opening_cash', account, amount, entry_on: day, notes: 'Balance at go-live' }))
    return Promise.resolve(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const ok = (await saveOne('cash', cash, cashText)) && (await saveOne('bank', bank, bankText))
    setSaving(false)
    if (ok) onSaved()
  }

  return (
    <Card className="gap-4 px-5 pt-4 pb-5">
      <div className="flex flex-col gap-1">
        <h2 className="type-h3 text-fg-primary">Cash and bank at go-live</h2>
        <p className="type-body-sm text-fg-tertiary">Counted on {fullDate(day)}, the day before go-live. Cash and bank on the Balance Sheet start from these.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cash in hand">
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={cashText} disabled={!canEdit} onChange={(e) => setCashText(e.target.value)} onBlur={() => num(cashText) && setCashText(formatNumber(num(cashText)))} />}
          </Field>
          <Field label="Bank balance" hint="All bank accounts together">
            {(id) => <TextInput id={id} prefix="₦" inputMode="numeric" value={bankText} disabled={!canEdit} onChange={(e) => setBankText(e.target.value)} onBlur={() => num(bankText) && setBankText(formatNumber(num(bankText)))} />}
          </Field>
        </div>
        {canEdit && (
          <div>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save opening balances'}
            </Button>
          </div>
        )}
      </form>
    </Card>
  )
}
