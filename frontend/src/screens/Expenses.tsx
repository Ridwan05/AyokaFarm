'use client'

import { Download, ListFilter, Plus, Warehouse } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { SearchInput } from '../components/ui/Form'
import { KeyValueRow } from '../components/ui/KeyValueRow'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { NumberCell, Table, TextCell, type Column } from '../components/ui/Table'
import type { Expense } from '../data/expenses'
import { period as periodRange, previous, type Range } from '../data/metrics'
import { expenseTotal, expensesIn, pctChange, spanLabel } from '../data/moneyKpis'
import { useTrade } from '../data/tradeContext'
import { AddExpenseModal } from '../features/expenses/AddExpenseModal'
import { ExpenseDrawer } from '../features/expenses/ExpenseDrawer'
import { dayMonth } from '../features/purchases/purchaseView'
import { cn } from '../lib/cn'
import { downloadCsv } from '../lib/export'
import { formatNaira, formatNumber } from '../lib/format'
import { Presence } from '../components/ui/Overlay'

const PERIODS = ['This month', 'Last month', 'This year'] as const
type Period = (typeof PERIODS)[number]

const rangeOf = (p: Period): Range => periodRange(p === 'This month' ? 'month' : p === 'Last month' ? 'last-month' : 'ytd')
/** The period compared against: the same days a month (or year) earlier. */
function compareWith(p: Period, r: Range): Range {
  if (p !== 'This year') return previous(r)
  const back = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`
  return { from: back(r.from), to: back(r.to), label: 'last year' }
}

export default function Expenses() {
  const { expenses, suppliers, catalog, history } = useTrade()
  const [period, setPeriod] = useState<Period>('This month')
  const [category, setCategory] = useState('All categories')
  const [pen, setPen] = useState('All pens')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const penName = (id: number | null) => (id === null ? 'General' : (catalog.pens.find((p) => p.id === id)?.name ?? `Pen ${id}`))
  const categories = [...new Set([...catalog.categories.filter((c) => c.is_active).map((c) => c.name), ...expenses.map((e) => e.category)])]
  const categoryFilters = ['All categories', ...categories]
  const penFilters = ['All pens', 'General', ...catalog.pens.map((p) => p.name)]

  const range = rangeOf(period)
  const before = compareWith(period, range)
  const inPeriod = expensesIn(expenses, range)
  const q = query.trim().toLowerCase()
  const rows = inPeriod
    .filter((e) => category === 'All categories' || e.category === category)
    .filter((e) => pen === 'All pens' || penName(e.pen) === pen)
    .filter((e) => !q || e.description.toLowerCase().includes(q))

  const total = inPeriod.reduce((n, e) => n + e.amount, 0)
  const byCategory = categories
    .map((c) => ({ c, amount: inPeriod.filter((e) => e.category === c).reduce((n, e) => n + e.amount, 0) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const max = Math.max(...byCategory.map((x) => x.amount), 1)
  const tied = inPeriod.filter((e) => e.pen !== null).reduce((n, e) => n + e.amount, 0)
  const withReceipt = inPeriod.filter((e) => e.receipt).length
  const open = expenses.find((e) => e.id === openId)
  const pensWithBirds = new Set(history.flocks.filter((f) => f.status === 'active').map((f) => f.pen_id)).size

  const columns: Column<Expense>[] = [
    { key: 'date', header: 'Date', width: 84, render: (e) => <TextCell tone="primary">{dayMonth(e.date)}</TextCell> },
    { key: 'category', header: 'Category', width: 130, render: (e) => <TextCell>{e.category}</TextCell> },
    { key: 'description', header: 'Description', render: (e) => <TextCell tone="primary">{e.description}</TextCell> },
    { key: 'pen', header: 'Pen', width: 96, render: (e) => <TextCell>{penName(e.pen)}</TextCell> },
    { key: 'supplier', header: 'Supplier', width: 190, render: (e) => <TextCell>{suppliers.find((s) => s.id === e.supplierId)?.name ?? '—'}</TextCell> },
    { key: 'amount', header: 'Amount', align: 'right', width: 110, render: (e) => <NumberCell>{formatNaira(e.amount)}</NumberCell> },
    { key: 'receipt', header: 'Receipt', width: 90, render: (e) => <TextCell>{e.receipt ? 'Photo' : '—'}</TextCell> },
    { key: 'by', header: 'Added by', width: 90, render: (e) => <TextCell>{e.addedBy}</TextCell> },
  ]

  return (
    <>
      <PageHeader
        eyebrow={['Trade', 'Expenses']}
        title="Expenses"
        description={`${range.label} · ${spanLabel(range)}. Expenses count the moment they’re saved; costs without a pen are shared across pens by bird-days.`}
        actions={
          <>
            <Button
              leadingIcon={Download}
              onClick={() =>
                downloadCsv(
                  'expenses',
                  ['Ref', 'Date', 'Category', 'Description', 'Pen', 'Supplier', 'Amount (₦)', 'Paid (₦)', 'Method', 'Receipt', 'Added by'],
                  rows.map((e) => [e.id, e.date, e.category, e.description, penName(e.pen), suppliers.find((s) => s.id === e.supplierId)?.name ?? '', e.amount, e.amountPaid ?? e.amount, e.method, e.receipt ? 'Yes' : 'No', e.addedBy]),
                )
              }
            >
              Export
            </Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setAdding(true)}>
              Add expense
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        <Select label="Category" leadingIcon={ListFilter} width={190} options={categoryFilters} value={category} onChange={setCategory} />
        <Select label="Pen" leadingIcon={Warehouse} width={170} options={penFilters} value={pen} onChange={setPen} />
        <span className="flex-1" />
        <SearchInput label="Search description" placeholder="Search description" width={240} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="min-w-0 flex-1 px-5 pt-4 pb-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">By category</h2>
            <span className="type-body-sm text-fg-tertiary">{spanLabel(range)}</span>
          </div>
          {byCategory.length === 0 && <p className="py-4 type-body-md text-fg-tertiary">No expenses in this period.</p>}
          <ul className="flex flex-col">
            {byCategory.map((x, i) => (
              <li key={x.c} className="flex h-8 items-center gap-4">
                <span className="w-[126px] shrink-0 truncate type-body-md text-fg-secondary">{x.c}</span>
                <span className="flex-1">
                  <span className={cn('block h-2.5 rounded-xs', i === 0 ? 'bg-chart-1' : 'bg-chart-5')} style={{ width: `${(x.amount / max) * 100}%` }} />
                </span>
                <span className="w-[100px] shrink-0 text-right type-numeric-md text-fg-primary">{formatNaira(x.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="pt-3 type-body-sm text-fg-tertiary">Medication is bought through Purchases, so it isn’t counted here twice.</p>
        </Card>

        <Card className="w-full shrink-0 lg:w-[380px] gap-1 px-5 pt-4 pb-5">
          <h2 className="type-h3 text-fg-primary">Where it goes</h2>
          <p className="flex items-baseline gap-2 py-2">
            <span className="type-display-lg text-fg-primary">₦{(total / 1e6).toFixed(2)}M</span>
            <span className="type-body-md text-fg-tertiary">{period.toLowerCase()}</span>
          </p>
          <KeyValueRow label="Tied to a pen">{formatNaira(tied)}</KeyValueRow>
          <KeyValueRow label="General overhead">{formatNaira(total - tied)}</KeyValueRow>
          <KeyValueRow label="Shared by bird-days" calculated>
            {pensWithBirds} pen{pensWithBirds === 1 ? '' : 's'}
          </KeyValueRow>
          <KeyValueRow label="Receipts attached">
            {withReceipt} of {inPeriod.length}
          </KeyValueRow>
          <KeyValueRow label={`vs ${spanLabel(before)}`} strong>
            {pctChange(total, expenseTotal(expenses, before))}
          </KeyValueRow>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`Expenses · ${period.toLowerCase()}`}
          meta={<span className="type-body-sm text-fg-tertiary">Each one stamped with who added it · {formatNumber(rows.length)} shown</span>}
          action={{ label: 'All expenses', onClick: () => setPeriod('This year') }}
        />
        <Table columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={(e) => setOpenId(e.id)} />
        {rows.length === 0 && <p className="px-5 py-6 type-body-md text-fg-tertiary">No expenses match these filters.</p>}
      </Card>

      <Presence>{adding && <AddExpenseModal onClose={() => setAdding(false)} />}</Presence>
      <Presence>{open && <ExpenseDrawer expense={open} onClose={() => setOpenId(null)} />}</Presence>
    </>
  )
}
