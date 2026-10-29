'use client'

import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Card } from '../../components/ui/Card'
import { Presence } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { incomeStatement, openingDate, useFinance, type IncomeStatement as Statement, type Line } from '../../data/finance'
import { dayMonth, period, previous, todayISO, type PeriodKey } from '../../data/metrics'
import { usePayroll } from '../../data/payroll'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { StatementTable, type StatementRow } from '../../features/finance/StatementTable'
import { PenMoneyItemsModal } from '../../features/pens/PenMoneyItemsModal'
import { accessOf } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { farmSettings } from '../../data/farmSettings'
import { ReportHeader } from './ReportHeader'

const PERIODS = ['This month', 'Last month', 'Quarter', 'Year to date'] as const
const PERIOD_KEY: Record<(typeof PERIODS)[number], PeriodKey> = { 'This month': 'month', 'Last month': 'last-month', Quarter: 'quarter', 'Year to date': 'ytd' }

/** Current lines plus any that only appear in the comparison period (shown at nil now). */
function withPrev(now: Line[], before: Line[]): StatementRow[] {
  const prev = new Map(before.map((l) => [l.key, l.amount]))
  const rows: StatementRow[] = now.map((line) => ({ type: 'line', line, prev: prev.get(line.key) ?? null }))
  for (const l of before) if (!now.some((x) => x.key === l.key)) rows.push({ type: 'line', line: { ...l, amount: 0, items: [] }, prev: l.amount })
  return rows
}

function rowsFor(s: Statement, p: Statement): StatementRow[] {
  return [
    { type: 'heading', label: '1. Revenue (income)' },
    ...withPrev(s.revenue, p.revenue),
    { type: 'total', label: 'Total revenue (A)', amount: s.totalRevenue, prev: p.totalRevenue, info: 'All income lines above added up.' },
    { type: 'heading', label: '2. Operating expenses' },
    ...withPrev(s.operating, p.operating),
    { type: 'total', label: 'Total operating expenses (B)', amount: s.totalOperating, prev: p.totalOperating, info: 'Costs of producing eggs and birds: feed, birds, health, utilities, supplies, labour, maintenance and stock losses, after taking off the value added to flocks and eggs still on hand.' },
    { type: 'total', label: '3. Gross profit (A − B)', amount: s.grossProfit, prev: p.grossProfit, info: 'Revenue less operating expenses.', grand: true },
    { type: 'heading', label: '4. Overhead and administrative expenses' },
    ...withPrev(s.overheads, p.overheads),
    { type: 'total', label: 'Total overheads (C)', amount: s.totalOverheads, prev: p.totalOverheads, info: 'Transport, marketing, permits, miscellaneous expenses and depreciation.' },
    { type: 'total', label: '5. Net profit / (loss)', amount: s.netProfit, prev: p.netProfit, info: 'Gross profit less overheads. Accrual basis: sales when made, feed and medication when used, assets at cost.', grand: true },
  ]
}

export default function IncomeStatement() {
  const { history, catalog } = useTrade()
  const user = useCurrentUser()
  const finance = useFinance()
  const payroll = usePayroll()
  const [periodName, setPeriodName] = useState<(typeof PERIODS)[number]>('This month')
  const [open, setOpen] = useState<Line | null>(null)

  const today = todayISO()
  const range = period(PERIOD_KEY[periodName], today)
  const prevRange = previous(range)
  // Payroll figures only for roles that can see all of payroll (otherwise RLS returns just their own).
  const payrollData = accessOf(user, 'payroll') !== 'none' && payroll.loaded && !payroll.error ? payroll.data : null
  const ready = finance.loaded && (payroll.loaded || payroll.error !== null)
  const inputs = { history, catalog, finance: finance.data, payroll: payrollData }
  const s = ready ? incomeStatement(inputs, range) : null
  const p = ready ? incomeStatement(inputs, prevRange) : null
  const rows = s && p ? rowsFor(s, p) : []
  const G = openingDate(history)
  const prevLabel = `${dayMonth(prevRange.from)} – ${dayMonth(prevRange.to)}`

  const exportCsv = () =>
    downloadCsv(
      `income-statement-${range.from}-${range.to}`,
      ['Item', `${range.label} (₦)`, `${prevLabel} (₦)`, '% of revenue'],
      rows.map((r) =>
          r.type === 'heading'
            ? [r.label, null, null, null]
            : r.type === 'total'
              ? [r.label, Math.round(r.amount), r.prev == null ? null : Math.round(r.prev), s?.totalRevenue ? ((r.amount / s.totalRevenue) * 100).toFixed(1) : null]
              : [`  ${r.line.label}`, Math.round(r.line.amount), r.prev == null ? null : Math.round(r.prev), s?.totalRevenue ? ((r.line.amount / s.totalRevenue) * 100).toFixed(1) : null],
        ),
    )

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Income statement"
        description={`${farmSettings.farmName} · statement of income and expenditure · accrual basis`}
        onExport={ready && !finance.error ? exportCsv : undefined}
      />
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <SegmentedControl label="Period" options={PERIODS} value={periodName} onChange={setPeriodName} />
        <span className="type-body-sm text-fg-tertiary">
          {dayMonth(s?.range.from ?? range.from)} – {dayMonth(range.to)} · compared with {prevLabel}
        </span>
      </div>

      {finance.error ? (
        <Alert tone="danger" title="Financial records aren’t available">
          {/fixed_assets|finance_entries|does not exist|schema cache/i.test(finance.error)
            ? 'The finance tables haven’t been set up yet. Run the finance migrations in the Supabase SQL Editor, then reload.'
            : finance.error}
        </Alert>
      ) : !s ? (
        <Card className="items-center p-12">
          <p className="type-body-md text-fg-tertiary">Working out the statement…</p>
        </Card>
      ) : (
        <>
          {range.from < G && (
            <Alert tone="info" title={`Figures start at go-live (${dayMonth(G)})`}>
              Records before go-live are covered by the opening balances, so the statement starts on that day.
            </Alert>
          )}
          {!payrollData && accessOf(user, 'payroll') === 'none' && (
            <Alert tone="info" title="Payroll details left out">
              Your role can’t see payroll, so deductions kept from pay aren’t shown. Approved payroll still appears as Labour.
            </Alert>
          )}
          <Card className="overflow-hidden pb-2">
            <StatementTable rows={rows} currentLabel={range.label} prevLabel={prevLabel} percentOf={s.totalRevenue} onOpen={setOpen} />
          </Card>
          <p className="type-body-sm text-fg-tertiary">
            Tap any line to see the records behind it. Live birds and eggs in store are assets at cost, so the value they gain is taken off costs; feed and
            medication are costs when used, not when bought.
          </p>
        </>
      )}

      <Presence>
        {open && s && (
          <PenMoneyItemsModal
            title={open.label}
            penName="Income statement"
            range={s.range.from === range.from ? range : { ...s.range, label: range.label }}
            items={open.items}
            total={open.amount}
            note={open.info}
            onClose={() => setOpen(null)}
          />
        )}
      </Presence>
    </div>
  )
}
