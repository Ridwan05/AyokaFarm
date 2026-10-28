import { CalendarDays, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import type { StatementLine } from '../../data/ledger'
import { formatNaira, formatNumber } from '../../lib/format'

const RANGES = ['01 Jul – 09 Oct 2026', 'October 2026', 'September 2026'] as const
const inRange: Record<(typeof RANGES)[number], (iso: string) => boolean> = {
  '01 Jul – 09 Oct 2026': () => true,
  'October 2026': (d) => d >= '2026-10-01',
  'September 2026': (d) => d >= '2026-09-01' && d < '2026-10-01',
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const dash = <NumberCell tone="muted">—</NumberCell>

type Props = {
  lines: StatementLine[]
  /** "customer" → Charged / Balance; "supplier" → Bought / We owe. */
  side: 'customer' | 'supplier'
  balance: number
  onDownload: () => void
}

/** Running-balance statement with All / charges / payments views and a date range. */
export function StatementCard({ lines, side, balance, onDownload }: Props) {
  const views = side === 'customer' ? (['All', 'Sales', 'Payments'] as const) : (['All', 'Purchases', 'Payments'] as const)
  const [view, setView] = useState<string>('All')
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0])
  const lastRef = lines[lines.length - 1]?.ref

  const visible = lines
    .filter((l) => inRange[range](l.date))
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
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <div className="flex flex-1 flex-col">
          <h2 className="type-h3 text-fg-primary">Statement</h2>
          <p className="type-body-sm text-fg-tertiary">
            Every {side === 'customer' ? 'sale' : 'purchase'} and payment with a running balance — nothing typed by hand
          </p>
        </div>
        <SegmentedControl label="Entries" options={views} value={view} onChange={setView} />
        <Select label="Date range" leadingIcon={CalendarDays} width={240} options={RANGES} value={range} onChange={setRange} />
        <Button variant="ghost" leadingIcon={Download} onClick={onDownload}>
          PDF
        </Button>
      </div>
      <Table columns={columns} rows={visible} rowKey={(l) => `${l.date}-${l.ref ?? l.entry}`} rowClassName={(l) => (l.ref && l.ref === lastRef ? 'bg-brand-subtle' : undefined)} />
      <div className="flex items-center rounded-b-xl bg-canvas px-5 py-4">
        <span className="flex-1 type-body-sm text-fg-secondary">
          Closing balance on 09/10/2026 · payments {side === 'customer' ? 'are applied to the oldest unpaid sale first' : 'clear the oldest purchase first'}
        </span>
        <span className="type-numeric-lg text-fg-primary">₦ {formatNumber(balance)}</span>
      </div>
    </Card>
  )
}
