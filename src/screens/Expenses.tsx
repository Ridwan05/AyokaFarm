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
import { expenseCategories, vsLastMonth, type Expense } from '../data/expenses'
import { useTrade } from '../data/tradeContext'
import { suppliers } from '../data/suppliers'
import { AddExpenseModal } from '../features/expenses/AddExpenseModal'
import { ExpenseDrawer } from '../features/expenses/ExpenseDrawer'
import { dayMonth } from '../features/purchases/purchaseView'
import { cn } from '../lib/cn'
import { formatNaira, formatNumber } from '../lib/format'
import { Presence } from '../components/ui/Overlay'

const PERIODS = ['This month', 'Last month', 'This year'] as const
const CATEGORY_FILTERS = ['All categories', ...expenseCategories]
const PEN_FILTERS = ['All pens', 'General', 'Pen 1', 'Pen 2', 'Pen 3', 'Pen 4', 'Pen 5', 'Pen 6']

const columns: Column<Expense>[] = [
  { key: 'date', header: 'Date', width: 84, render: (e) => <TextCell tone="primary">{dayMonth(e.date)}</TextCell> },
  { key: 'category', header: 'Category', width: 130, render: (e) => <TextCell>{e.category}</TextCell> },
  { key: 'description', header: 'Description', render: (e) => <TextCell tone="primary">{e.description}</TextCell> },
  { key: 'pen', header: 'Pen', width: 96, render: (e) => <TextCell>{e.pen ? `Pen ${e.pen}` : 'General'}</TextCell> },
  { key: 'supplier', header: 'Supplier', width: 190, render: (e) => <TextCell>{suppliers.find((s) => s.id === e.supplierId)?.name ?? '—'}</TextCell> },
  { key: 'amount', header: 'Amount', align: 'right', width: 110, render: (e) => <NumberCell>{formatNaira(e.amount)}</NumberCell> },
  { key: 'receipt', header: 'Receipt', width: 90, render: (e) => <TextCell>{e.receipt ? 'Photo' : '—'}</TextCell> },
  { key: 'by', header: 'Added by', width: 90, render: (e) => <TextCell>{e.addedBy}</TextCell> },
]

export default function Expenses() {
  const { expenses } = useTrade()
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('This month')
  const [category, setCategory] = useState(CATEGORY_FILTERS[0])
  const [pen, setPen] = useState(PEN_FILTERS[0])
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  // Mock data only covers October, so "Last month" is empty.
  const inPeriod = expenses.filter((e) => (period === 'Last month' ? e.date < '2026-10-01' && e.date >= '2026-09-01' : period === 'This month' ? e.date >= '2026-10-01' : true))
  const q = query.trim().toLowerCase()
  const rows = inPeriod
    .filter((e) => category === 'All categories' || e.category === category)
    .filter((e) => pen === 'All pens' || (pen === 'General' ? e.pen === null : e.pen === Number(pen.split(' ')[1])))
    .filter((e) => !q || e.description.toLowerCase().includes(q))

  const total = inPeriod.reduce((n, e) => n + e.amount, 0)
  const byCategory = expenseCategories
    .map((c) => ({ c, amount: inPeriod.filter((e) => e.category === c).reduce((n, e) => n + e.amount, 0) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const max = Math.max(...byCategory.map((x) => x.amount), 1)
  const tied = inPeriod.filter((e) => e.pen !== null).reduce((n, e) => n + e.amount, 0)
  const withReceipt = inPeriod.filter((e) => e.receipt).length
  const open = expenses.find((e) => e.id === openId)

  return (
    <>
      <PageHeader
        eyebrow={['Trade', 'Expenses']}
        title="Expenses"
        description="October so far. Expenses count the moment they’re saved; costs without a pen are shared across pens by bird-days."
        actions={
          <>
            <Button leadingIcon={Download}>Export</Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setAdding(true)}>
              Add expense
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        <Select label="Category" leadingIcon={ListFilter} width={190} options={CATEGORY_FILTERS} value={category} onChange={setCategory} />
        <Select label="Pen" leadingIcon={Warehouse} width={170} options={PEN_FILTERS} value={pen} onChange={setPen} />
        <span className="flex-1" />
        <SearchInput label="Search description" placeholder="Search description" width={240} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="min-w-0 flex-1 px-5 pt-4 pb-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">By category</h2>
            <span className="type-body-sm text-fg-tertiary">{period === 'This month' ? 'October 1–9' : period}</span>
          </div>
          {byCategory.length === 0 && <p className="py-4 type-body-md text-fg-tertiary">No expenses in this period.</p>}
          <ul className="flex flex-col">
            {byCategory.map((x, i) => (
              <li key={x.c} className="flex h-8 items-center gap-4">
                <span className="w-[126px] shrink-0 type-body-md text-fg-secondary">{x.c}</span>
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
            Pens 1–6
          </KeyValueRow>
          <KeyValueRow label="Receipts attached">
            {withReceipt} of {inPeriod.length}
          </KeyValueRow>
          <KeyValueRow label="vs September (same days)" strong>
            {vsLastMonth}
          </KeyValueRow>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={period === 'This month' ? 'October expenses' : `Expenses · ${period.toLowerCase()}`}
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
