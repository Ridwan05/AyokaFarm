import { CalendarDays, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import type { StatementLine } from '../../data/ledger'
import { period, todayISO } from '../../data/metrics'
import { downloadCsv } from '../../lib/export'
import { formatNaira, formatNumber } from '../../lib/format'

/** Since go-live, this month and last month; from/to are left out for "everything". */
function ranges() {
  const now = period('month')
  const last = period('last-month')
  const year = (r: { to: string }) => r.to.slice(0, 4)
  return [
    { label: 'Since go-live', from: undefined, to: undefined },
    { label: `${now.label} ${year(now)}`, from: now.from, to: now.to },
    { label: `${last.label} ${year(last)}`, from: last.from, to: last.to },
  ]
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const dash = <NumberCell tone="muted">—</NumberCell>

type Props = {
  lines: StatementLine[]
  /** "customer" → Charged / Balance; "supplier" → Bought / We owe. */
  side: 'customer' | 'supplier'
  balance: number
  /** Opens the printable statement for the chosen dates. */
  onDownload: (range: { from?: string; to?: string }) => void
  /** File name for the spreadsheet export, e.g. "statement-mama-titi". */
  exportName: string
}

/** Running-balance statement with All / charges / payments views and a date range. */
export function StatementCard({ lines, side, balance, onDownload, exportName }: Props) {
  const views = side === 'customer' ? (['All', 'Sales', 'Payments'] as const) : (['All', 'Purchases', 'Payments'] as const)
  const [view, setView] = useState<string>('All')
  const RANGES = ranges()
  const [rangeLabel, setRangeLabel] = useState(RANGES[0].label)
  const range = RANGES.find((r) => r.label === rangeLabel) ?? RANGES[0]
  const lastRef = lines[lines.length - 1]?.ref

  const visible = lines
    .filter((l) => (!range.from || l.date >= range.from) && (!range.to || l.date <= range.to))
    .filter((l) => (view === 'All' ? true : view === 'Payments' ? l.charged === null && l.entry !== 'Opening balance' : l.charged !== null))

  const columns: Column<StatementLine>[] = [
    { key: 'date', header: 'Date', width: 140, render: (l) => <TextCell>{dmy(l.date)}</TextCell> },
    { key: 'entry', header: 'Entry', render: (l) => <TextCell tone="primary">{l.entry}</TextCell> },
    { key: 'ref', header: 'Ref', width: 110, render: (l) => (l.ref ? <TextCell mono>{l.ref}</TextCell> : <TextCell tone="tertiary">—</TextCell>) },
    {
      key: 'charged',
      header: side === 'customer' ? 'Charged' : 'Bought',
      align: 'right',
      width: 140,
      render: (l) => (l.charged === null ? dash : <NumberCell>{formatNaira(l.charged)}</NumberCell>),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      width: 150,
      render: (l) =>
        !l.paid ? dash : <NumberCell tone={side === 'customer' && l.charged === null ? 'success' : 'default'}>{formatNaira(l.paid)}</NumberCell>,
    },
    { key: 'balance', header: side === 'customer' ? 'Balance' : 'We owe', align: 'right', width: 160, render: (l) => <NumberCell>{formatNaira(l.balance)}</NumberCell> },
  ]

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
        <div className="flex min-w-[220px] flex-1 flex-col">
          <h2 className="type-h3 text-fg-primary">Statement</h2>
          <p className="type-body-sm text-fg-tertiary">
            Every {side === 'customer' ? 'sale' : 'purchase'} and payment with a running balance — nothing typed by hand
          </p>
        </div>
        <SegmentedControl label="Entries" options={views} value={view} onChange={setView} />
        <Select label="Date range" leadingIcon={CalendarDays} width={200} options={RANGES.map((r) => r.label)} value={range.label} onChange={setRangeLabel} />
        <Button
          variant="ghost"
          leadingIcon={Download}
          onClick={() =>
            downloadCsv(
              exportName,
              ['Date', 'Entry', 'Ref', side === 'customer' ? 'Charged (₦)' : 'Bought (₦)', 'Paid (₦)', side === 'customer' ? 'Balance (₦)' : 'We owe (₦)'],
              visible.map((l) => [l.date, l.entry, l.ref, l.charged, l.paid, l.balance]),
            )
          }
        >
          Excel
        </Button>
        <Button variant="ghost" leadingIcon={Download} onClick={() => onDownload({ from: range.from, to: range.to })}>
          PDF
        </Button>
      </div>
      <Table columns={columns} rows={visible} rowKey={(l) => `${l.date}-${l.ref ?? l.entry}`} rowClassName={(l) => (l.ref && l.ref === lastRef ? 'bg-brand-subtle' : undefined)} />
      <div className="flex items-center rounded-b-xl bg-canvas px-5 py-4">
        <span className="flex-1 type-body-sm text-fg-secondary">
          Closing balance on {dmy(todayISO())} · payments {side === 'customer' ? 'are applied to the oldest unpaid sale first' : 'clear the oldest purchase first'}
        </span>
        <span className="type-numeric-lg text-fg-primary">₦ {formatNumber(balance)}</span>
      </div>
    </Card>
  )
}
