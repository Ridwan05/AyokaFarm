'use client'

import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Card } from '../../components/ui/Card'
import { DateInput, Field } from '../../components/ui/Form'
import { InfoTip } from '../../components/ui/InfoTip'
import { Presence } from '../../components/ui/Overlay'
import { balanceSheet, openingDate, unreconciledInfo, useFinance, type BalanceSheet as Sheet, type Line } from '../../data/finance'
import { farmSettings } from '../../data/farmSettings'
import { addDays, dayMonth, todayISO } from '../../data/metrics'
import { usePayroll } from '../../data/payroll'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { StatementTable, type StatementRow } from '../../features/finance/StatementTable'
import { money } from '../../features/finance/statementFormat'
import { PenMoneyItemsModal } from '../../features/pens/PenMoneyItemsModal'
import { accessOf } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { ReportHeader } from './ReportHeader'

const lines = (now: Line[], before: Sheet | null, pick: (b: Sheet) => Line[]): StatementRow[] => {
  const prev = before ? new Map(pick(before).map((l) => [l.key, l.amount])) : null
  const rows: StatementRow[] = now.map((line) => ({ type: 'line', line, prev: prev ? (prev.get(line.key) ?? 0) : null }))
  if (before) for (const l of pick(before)) if (!now.some((x) => x.key === l.key)) rows.push({ type: 'line', line: { ...l, amount: 0, items: [] }, prev: l.amount })
  return rows
}

function rowsFor(s: Sheet, p: Sheet | null): StatementRow[] {
  return [
    { type: 'heading', label: 'Current assets' },
    ...lines(s.currentAssets, p, (b) => b.currentAssets),
    { type: 'total', label: 'Total current assets (A)', amount: s.totalCurrentAssets, prev: p?.totalCurrentAssets ?? null },
    { type: 'heading', label: 'Non-current (fixed) assets' },
    ...lines(s.fixedAssets, p, (b) => b.fixedAssets),
    { type: 'total', label: 'Total fixed assets (B)', amount: s.totalFixedAssets, prev: p?.totalFixedAssets ?? null },
    { type: 'total', label: 'Total assets (A + B)', amount: s.totalAssets, prev: p?.totalAssets ?? null, grand: true },
    { type: 'heading', label: 'Current liabilities' },
    ...lines(s.currentLiabilities, p, (b) => b.currentLiabilities),
    { type: 'total', label: 'Total current liabilities (C)', amount: s.totalCurrentLiabilities, prev: p?.totalCurrentLiabilities ?? null },
    { type: 'heading', label: 'Non-current liabilities' },
    ...lines(s.longTermLiabilities, p, (b) => b.longTermLiabilities),
    { type: 'total', label: 'Total non-current liabilities (D)', amount: s.totalLongTermLiabilities, prev: p?.totalLongTermLiabilities ?? null },
    { type: 'total', label: 'Total liabilities (C + D)', amount: s.totalLiabilities, prev: p?.totalLiabilities ?? null },
    { type: 'heading', label: 'Equity (net worth)' },
    ...lines(s.equity, p, (b) => b.equity),
    { type: 'total', label: 'Total equity (E)', amount: s.totalEquity, prev: p?.totalEquity ?? null },
    {
      type: 'total',
      label: 'Total liabilities and equity (C + D + E)',
      amount: s.totalLiabilities + s.totalEquity,
      prev: p ? p.totalLiabilities + p.totalEquity : null,
      info: 'Must match total assets.',
      grand: true,
    },
  ]
}

export default function BalanceSheet() {
  const { history, catalog } = useTrade()
  const user = useCurrentUser()
  const finance = useFinance()
  const payroll = usePayroll()
  const today = todayISO()
  const G = openingDate(history)
  const [asAt, setAsAt] = useState(today)
  const [open, setOpen] = useState<Line | null>(null)

  const date = asAt && asAt <= today ? (asAt < G ? G : asAt) : today
  // Compare with the end of the month before.
  const prevDate = addDays(`${date.slice(0, 8)}01`, -1)
  const payrollData = accessOf(user, 'payroll') !== 'none' && payroll.loaded && !payroll.error ? payroll.data : null
  const ready = finance.loaded && (payroll.loaded || payroll.error !== null)
  const inputs = { history, catalog, finance: finance.data, payroll: payrollData }
  const s = ready ? balanceSheet(inputs, date) : null
  const p = ready && prevDate >= G ? balanceSheet(inputs, prevDate) : null
  const rows = s ? rowsFor(s, p) : []
  const balanced = s ? Math.abs(s.difference) < 1 : false
  const currentLabel = `As at ${dayMonth(date)} ${date.slice(0, 4)}`
  const prevLabel = p ? `${dayMonth(prevDate)} ${prevDate.slice(0, 4)}` : undefined

  const exportCsv = () =>
    downloadCsv(
      `balance-sheet-${date}`,
      ['Item', `${currentLabel} (₦)`, ...(prevLabel ? [`${prevLabel} (₦)`] : [])],
      [
        ...rows.map((r) =>
          r.type === 'heading'
            ? [r.label, null, ...(prevLabel ? [null] : [])]
            : r.type === 'total'
              ? [r.label, Math.round(r.amount), ...(prevLabel ? [r.prev == null ? null : Math.round(r.prev)] : [])]
              : [`  ${r.line.label}`, Math.round(r.line.amount), ...(prevLabel ? [r.prev == null ? null : Math.round(r.prev)] : [])],
        ),
        ['Unreconciled difference', s ? Math.round(s.difference) : null, ...(prevLabel ? [p ? Math.round(p.difference) : null] : [])],
      ],
    )

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Balance sheet"
        description={`${farmSettings.farmName} · statement of financial position · assets at cost`}
        onExport={s && !finance.error ? exportCsv : undefined}
      />
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="As at" className="w-full max-w-[220px]">
          {(id) => <DateInput id={id} size="md" value={asAt} min={G} max={today} onChange={(e) => setAsAt(e.target.value)} />}
        </Field>
        <span className="pb-2.5 type-body-sm text-fg-tertiary">
          {p ? `Compared with ${prevLabel}` : 'No comparison before go-live'} · opening balances at {dayMonth(G)} {G.slice(0, 4)}
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
          <p className="type-body-md text-fg-tertiary">Working out the balance sheet…</p>
        </Card>
      ) : (
        <>
          {!s.payrollIncluded && (
            <Alert tone="info" title="Payroll left out">
              Your role can’t see payroll, so staff loans, unpaid wages and statutory deductions aren’t included. That can show as an unreconciled difference.
            </Alert>
          )}
          <Card className="overflow-hidden pb-2">
            <StatementTable rows={rows} currentLabel={currentLabel} prevLabel={prevLabel} onOpen={setOpen} />
            <div className={`mx-5 mt-2 flex items-center gap-2 rounded-lg px-3 py-2.5 ${balanced ? 'bg-success-subtle' : 'bg-warning-subtle'}`}>
              {balanced ? (
                <CheckCircle2 size={18} strokeWidth={1.5} className="shrink-0 text-icon-success" aria-hidden />
              ) : (
                <TriangleAlert size={18} strokeWidth={1.5} className="shrink-0 text-icon-warning" aria-hidden />
              )}
              <span className={`flex-1 type-label-md ${balanced ? 'text-fg-success' : 'text-fg-warning'}`}>
                {balanced ? 'Balanced: total assets match liabilities and equity' : `Unreconciled difference ${money(s.difference)}`}
              </span>
              <InfoTip label="Unreconciled difference">{unreconciledInfo()}</InfoTip>
            </div>
          </Card>
          <p className="type-body-sm text-fg-tertiary">
            Tap any line to see the records behind it. Cash and bank are worked out from every payment in and out since go-live; enter opening balances, fixed
            assets, capital and loans under Finance.
          </p>
        </>
      )}

      <Presence>
        {open && s && (
          <PenMoneyItemsModal
            title={open.label}
            penName="Balance sheet"
            range={{ from: G, to: date, label: currentLabel }}
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
