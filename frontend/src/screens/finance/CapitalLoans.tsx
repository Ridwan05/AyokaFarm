'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { KpiCard } from '../../components/ui/KpiCard'
import { RowMenu } from '../../components/ui/Menu'
import { Presence } from '../../components/ui/Overlay'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { openingDate, useFinance, type FinanceEntry } from '../../data/finance'
import { dayMonth, kpi, nairaKpi, num, todayISO } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { EntryModal } from '../../features/finance/EntryModal'
import { accountLabel, entrySign, KIND_LABEL } from '../../features/finance/financeView'
import { FinanceState, FinanceTabs } from '../../features/finance/FinanceTabs'
import { accessOf, can } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { formatNaira } from '../../lib/format'

// Finance → Capital & loans: money in or out that isn't trade — the owner's capital and drawings,
// loans and their repayments, and other income.

const FLAT = [0, 0]

export default function CapitalLoans() {
  const user = useCurrentUser()
  const toast = useToast()
  const { history } = useTrade()
  const { data, loaded, error, reload, save } = useFinance()
  const [editing, setEditing] = useState<FinanceEntry | 'new' | null>(null)
  const goLive = openingDate(history)
  const today = todayISO()
  const canAdd = can(user, 'finance', 'add')
  const canEdit = can(user, 'finance', 'edit')
  const canDelete = accessOf(user, 'finance', 'delete') === 'all'

  const entries = data.entries.filter((e) => e.kind !== 'opening_cash').sort((a, b) => b.entry_on.localeCompare(a.entry_on) || b.id - a.id)
  const sinceGoLive = entries.filter((e) => e.entry_on >= goLive)
  const capital = sinceGoLive.filter((e) => e.kind === 'capital_in').reduce((n, e) => n + Number(e.amount), 0)
  const drawings = sinceGoLive.filter((e) => e.kind === 'drawing').reduce((n, e) => n + Number(e.amount), 0)
  const otherIncome = sinceGoLive.filter((e) => e.kind === 'other_income' && e.entry_on.slice(0, 4) === today.slice(0, 4)).reduce((n, e) => n + Number(e.amount), 0)

  // Loan balance per lender and term: received − repaid (including loans owed at go-live).
  const loans = new Map<string, { lender: string; term: string; received: number; repaid: number }>()
  for (const e of data.entries.filter((x) => x.kind === 'loan_received' || x.kind === 'loan_repaid')) {
    const key = `${e.counterparty}|${e.loan_term}`
    const l = loans.get(key) ?? { lender: e.counterparty ?? '—', term: e.loan_term ?? 'short', received: 0, repaid: 0 }
    if (e.kind === 'loan_received') l.received += Number(e.amount)
    else l.repaid += Number(e.amount)
    loans.set(key, l)
  }
  const loanList = [...loans.values()].sort((a, b) => b.received - b.repaid - (a.received - a.repaid))
  const owed = loanList.reduce((n, l) => n + l.received - l.repaid, 0)
  const lenders = [...new Set(data.entries.map((e) => e.counterparty).filter((x): x is string => Boolean(x)))]

  const kpis = [
    kpi({ label: 'Capital less drawings', ...nairaKpi(capital - drawings), current: null, previous: null, context: `${formatNaira(capital)} in · ${formatNaira(drawings)} out`, info: 'Money the owner put in − money the owner took out, since go-live.', spark: FLAT }),
    kpi({ label: 'Loans owed', ...nairaKpi(owed), current: null, previous: null, context: `${num(loanList.filter((l) => l.received - l.repaid > 0.5).length)} lenders`, info: 'Loans received (including those owed at go-live) − repayments, for every lender.', spark: FLAT }),
    kpi({ label: 'Other income this year', ...nairaKpi(otherIncome), current: null, previous: null, context: `Since 1 Jan ${today.slice(0, 4)}`, info: 'Income that isn’t a sale (grants, rent), recorded here. It counts as revenue on the Income Statement.', spark: FLAT }),
  ]

  const columns: Column<FinanceEntry>[] = [
    { key: 'ref', header: 'Ref', width: 88, render: (e) => <TextCell tone="primary" mono>{e.ref}</TextCell> },
    { key: 'date', header: 'Date', width: 112, render: (e) => <TextCell>{`${dayMonth(e.entry_on)} ${e.entry_on.slice(0, 4)}`}</TextCell> },
    {
      key: 'kind',
      header: 'What',
      render: (e) => (
        <span className="flex min-w-0 flex-col">
          <TextCell tone="primary">{KIND_LABEL[e.kind]}</TextCell>
          <span className="truncate type-body-sm text-fg-tertiary">
            {[e.counterparty, e.loan_term ? (e.loan_term === 'long' ? 'long-term' : 'within a year') : null, e.entry_on < goLive && e.kind === 'loan_received' ? 'owed at go-live' : null, e.notes].filter(Boolean).join(' · ') || '—'}
          </span>
        </span>
      ),
    },
    { key: 'account', header: 'Account', width: 96, render: (e) => <TextCell>{accountLabel(e.account)}</TextCell> },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: 136,
      render: (e) => (
        <NumberCell tone={entrySign(e.kind) < 0 ? 'muted' : 'default'}>
          {entrySign(e.kind) < 0 ? '−' : '+'} {formatNaira(Number(e.amount))}
        </NumberCell>
      ),
    },
  ]

  const exportRows = () =>
    downloadCsv(
      'capital-and-loans',
      ['Ref', 'Date', 'What', 'Account', 'Lender / who', 'Loan term', 'Amount', 'Notes'],
      entries.map((e) => [e.ref, e.entry_on, KIND_LABEL[e.kind], accountLabel(e.account), e.counterparty, e.loan_term, entrySign(e.kind) * Number(e.amount), e.notes]),
    )

  const remove = async (e: FinanceEntry) => {
    if (!window.confirm(`Delete ${e.ref}?`)) return
    if (await save((db) => db.from('finance_entries').delete().eq('id', e.id))) toast(`${e.ref} deleted`)
  }

  return (
    <>
      <PageHeader
        eyebrow={['Insight', 'Finance']}
        title="Capital & loans"
        description="The owner’s capital and drawings, loans and repayments, and other income. Each one moves cash or bank and shows on the Balance Sheet."
        actions={
          canAdd ? (
            <Button variant="primary" leadingIcon={Plus} onClick={() => setEditing('new')}>
              Record
            </Button>
          ) : undefined
        }
      />
      <FinanceTabs />
      {!loaded ? (
        <FinanceState error={error} onRetry={() => void reload()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
            {kpis.map((k) => (
              <KpiCard key={k.label} kpi={k} />
            ))}
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <Card className="min-w-0 flex-1">
              <CardHeader title="Entries" meta={<span className="type-body-sm text-fg-tertiary">{num(entries.length)} entries</span>} action={entries.length ? { label: 'Export', onClick: exportRows } : undefined} />
              {entries.length ? (
                <Table
                  columns={columns}
                  rows={entries}
                  rowKey={(e) => String(e.id)}
                  onRowClick={canEdit ? (e) => setEditing(e) : undefined}
                  rowActions={
                    canEdit
                      ? (e) => <RowMenu items={[{ label: 'Edit…', onSelect: () => setEditing(e) }, ...(canDelete ? [{ label: 'Delete', danger: true, onSelect: () => void remove(e) }] : [])]} />
                      : undefined
                  }
                />
              ) : (
                <p className="px-5 pb-5 type-body-md text-fg-tertiary">Nothing recorded yet. Record money the owner puts in or takes out, loans received and repaid, and other income.</p>
              )}
            </Card>
            <Card className="w-full shrink-0 gap-1 px-5 pt-4 pb-5 lg:w-[360px]">
              <h2 className="pb-2 type-h3 text-fg-primary">Loans by lender</h2>
              {loanList.length ? (
                loanList.map((l) => (
                  <KeyValueRow key={`${l.lender}|${l.term}`} label={`${l.lender} · ${l.term === 'long' ? 'long-term' : 'within a year'}`} calculated="Received − repaid for this lender and term.">
                    {formatNaira(l.received - l.repaid)}
                  </KeyValueRow>
                ))
              ) : (
                <p className="type-body-md text-fg-tertiary">No loans recorded.</p>
              )}
            </Card>
          </div>
        </>
      )}
      <Presence>{editing && <EntryModal entry={editing === 'new' ? undefined : editing} lenders={lenders} save={save} since={history.since} onClose={() => setEditing(null)} />}</Presence>
    </>
  )
}
