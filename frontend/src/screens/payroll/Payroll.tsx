'use client'

import { CalendarDays, CheckCircle2, Download, FileText, RefreshCw, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { InfoTip } from '../../components/ui/InfoTip'
import { KpiCard } from '../../components/ui/KpiCard'
import { Presence } from '../../components/ui/Overlay'
import { Select } from '../../components/ui/Select'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { kpi, nairaKpi, todayISO } from '../../data/metrics'
import { explainPayroll, monthLabel, monthOf, nextMonth, PAY_BASIS_LABEL, usePayroll, type PayrollLine } from '../../data/payroll'
import { initialsOf } from '../../data/session'
import { useCurrentUser } from '../../data/sessionContext'
import { ApproveModal } from '../../features/payroll/ApproveModal'
import { LineDrawer } from '../../features/payroll/LineDrawer'
import { PayModal } from '../../features/payroll/PayModal'
import { lineParts, METHOD_LABEL, workedLabel } from '../../features/payroll/payrollView'
import { can } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { formatNaira } from '../../lib/format'

/** The months to choose from: next month, this month and the eleven before it. */
function monthChoices(today: string) {
  const out = [nextMonth(today)]
  let m = monthOf(today)
  for (let i = 0; i < 12; i++) {
    out.push(m)
    const [y, mm] = m.split('-').map(Number)
    m = mm === 1 ? `${y - 1}-12-01` : `${y}-${String(mm - 1).padStart(2, '0')}-01`
  }
  return out
}

type Row = PayrollLine & { name: string; job: string; extras: number; loans: number; other: number }

export default function Payroll() {
  const user = useCurrentUser()
  const toast = useToast()
  const { data, loaded, error, save } = usePayroll()
  const today = todayISO()
  const [period, setPeriod] = useState(monthOf(today))
  const [editing, setEditing] = useState<number | null>(null)
  const [approving, setApproving] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [paying, setPaying] = useState(false)
  const [busy, setBusy] = useState(false)

  const canPrepare = can(user, 'payroll', 'add')
  const canEdit = can(user, 'payroll', 'edit')
  const owner = user.role === 'owner'

  const run = data.runs.find((r) => r.period === period)
  const approved = run?.status === 'approved'
  const rows: Row[] = (run ? data.lines.filter((l) => l.run_id === run.id) : [])
    .map((l) => {
      const e = data.employees.find((x) => x.id === l.employee_id)
      return { ...l, name: e?.full_name ?? 'Employee', job: e?.job_title ?? PAY_BASIS_LABEL[l.pay_basis], ...lineParts(data.items.filter((i) => i.line_id === l.id)) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const totals = rows.reduce((t, r) => ({ gross: t.gross + Number(r.gross), deductions: t.deductions + Number(r.deductions), net: t.net + Number(r.net) }), { gross: 0, deductions: 0, net: 0 })

  // Compare with the month before, when it has a run.
  const prevPeriod = (() => {
    const [y, m] = period.split('-').map(Number)
    return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`
  })()
  const prevRun = data.runs.find((r) => r.period === prevPeriod)
  const prevLines = prevRun ? data.lines.filter((l) => l.run_id === prevRun.id) : []
  const prevTotal = (k: 'gross' | 'deductions' | 'net') => (prevRun ? prevLines.reduce((n, l) => n + Number(l[k]), 0) : null)
  const vs = prevRun ? `vs ${monthLabel(prevPeriod).split(' ')[0]}` : 'No earlier month'
  const money = (label: string, k: 'gross' | 'deductions' | 'net', info: string) => {
    const v = nairaKpi(totals[k])
    return kpi({ label, value: v.value, unit: v.unit, current: totals[k], previous: prevTotal(k), goodWhen: 'neither', context: vs, info, spark: [] })
  }
  const kpis = run
    ? [
        kpi({ label: 'Staff paid', value: String(rows.length), unit: 'payslips', current: rows.length, previous: prevRun ? prevLines.length : null, goodWhen: 'neither', context: vs, info: 'Employees with a payslip this month: everyone employed during the month when it was prepared.', spark: [] }),
        money('Gross pay', 'gross', `${explainPayroll.gross()} Added up over every payslip.`),
        money('Deductions', 'deductions', `${explainPayroll.deductions()} Added up over every payslip.`),
        money('Net pay', 'net', `${explainPayroll.net()} Added up over every payslip.`),
      ]
    : []

  const prepare = async () => {
    setBusy(true)
    const ok = await save((db) => db.rpc('prepare_payroll', { period }))
    setBusy(false)
    if (ok) toast(run ? 'Added anyone new and this month’s repayments' : `${monthLabel(period)} prepared`)
  }

  const unpaid = rows.filter((r) => !r.paid_on)
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const selectedRows = rows.filter((r) => selected.includes(r.id))

  const columns: Column<Row>[] = [
    ...(approved && canEdit
      ? [
          {
            key: 'pick',
            header: '',
            width: 44,
            render: (r: Row) =>
              r.paid_on ? null : (
                <input
                  type="checkbox"
                  aria-label={`Select ${r.name}`}
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="size-4 cursor-pointer accent-(--ayk-color-bg-brand)"
                />
              ),
          } satisfies Column<Row>,
        ]
      : []),
    { key: 'name', header: 'Employee', render: (r) => <PrimaryCell initials={initialsOf(r.name)} title={r.name} subtitle={r.job} /> },
    { key: 'worked', header: 'Worked', width: 120, render: (r) => <TextCell>{workedLabel(r.pay_basis, Number(r.units), period)}</TextCell> },
    { key: 'basic', header: 'Basic', align: 'right', width: 110, render: (r) => <NumberCell>{formatNaira(Number(r.basic))}</NumberCell> },
    { key: 'extras', header: 'Extras', align: 'right', width: 100, render: (r) => <NumberCell tone={r.extras ? 'default' : 'muted'}>{r.extras ? `+ ${formatNaira(r.extras)}` : '—'}</NumberCell> },
    { key: 'loans', header: 'Loans', align: 'right', width: 100, render: (r) => <NumberCell tone={r.loans ? 'default' : 'muted'}>{r.loans ? `− ${formatNaira(r.loans)}` : '—'}</NumberCell> },
    { key: 'other', header: 'Deductions', align: 'right', width: 110, render: (r) => <NumberCell tone={r.other ? 'default' : 'muted'}>{r.other ? `− ${formatNaira(r.other)}` : '—'}</NumberCell> },
    { key: 'net', header: 'Net pay', align: 'right', width: 120, render: (r) => <NumberCell>{formatNaira(Number(r.net))}</NumberCell> },
    ...(approved
      ? [
          {
            key: 'paid',
            header: 'Paid',
            width: 150,
            render: (r: Row) =>
              r.paid_on ? (
                <TextCell>{`${r.paid_on.slice(8, 10)}/${r.paid_on.slice(5, 7)} · ${r.payment_method ? METHOD_LABEL[r.payment_method] : ''}`}</TextCell>
              ) : (
                <Badge tone="warning">Not paid</Badge>
              ),
          } satisfies Column<Row>,
        ]
      : []),
  ]

  const exportCsv = () =>
    downloadCsv(`payroll-${period.slice(0, 7)}`, ['Employee', 'Job', 'Basis', 'Worked', 'Rate (₦)', 'Basic (₦)', 'Extras (₦)', 'Loan repayments (₦)', 'Other deductions (₦)', 'Gross (₦)', 'Net (₦)', 'Paid on', 'Method', 'Reference'], rows.map((r) => [
      r.name, r.job, PAY_BASIS_LABEL[r.pay_basis], workedLabel(r.pay_basis, Number(r.units), period), Number(r.rate), Number(r.basic), r.extras, r.loans, r.other, Number(r.gross), Number(r.net),
      r.paid_on, r.payment_method ? METHOD_LABEL[r.payment_method] : '', r.payment_ref,
    ]))

  const editingLine = editing !== null ? data.lines.find((l) => l.id === editing) : undefined

  return (
    <>
      <PageHeader
        eyebrow={['People', 'Payroll']}
        title="Payroll"
        description="Prepare each month’s pay, check every payslip, then the owner approves. Advance and loan repayments come off automatically."
        actions={
          run ? (
            <Button leadingIcon={Download} onClick={exportCsv} disabled={!rows.length}>
              Export
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          label="Month"
          leadingIcon={CalendarDays}
          width={230}
          options={monthChoices(today)}
          value={period}
          onChange={(p) => {
            setPeriod(p)
            setSelected([])
          }}
          format={(p) => {
            const r = data.runs.find((x) => x.period === p)
            return `${monthLabel(p)}${r ? (r.status === 'approved' ? ' · approved' : ' · draft') : ''}`
          }}
        />
        {run && <Badge tone={approved ? 'success' : 'warning'}>{approved ? 'Approved' : 'Draft'}</Badge>}
        <span className="flex-1" />
        {run && !approved && canPrepare && (
          <Button leadingIcon={RefreshCw} disabled={busy} onClick={() => void prepare()}>
            Refresh
          </Button>
        )}
        {run && !approved && owner && (
          <Button variant="primary" leadingIcon={CheckCircle2} disabled={busy || !rows.length} onClick={() => setApproving(true)}>
            Approve & post
          </Button>
        )}
        {approved && canEdit && (
          <Button variant="primary" leadingIcon={Wallet} disabled={!selected.length} onClick={() => setPaying(true)}>
            Mark paid{selected.length ? ` (${selected.length})` : ''}
          </Button>
        )}
      </div>

      {error ? (
        <Alert tone="danger" title="Couldn’t load payroll">
          {error}
        </Alert>
      ) : !loaded ? (
        <Card className="items-center p-12">
          <p className="type-body-md text-fg-tertiary">Loading payroll…</p>
        </Card>
      ) : !run ? (
        <Card className="items-center gap-4 p-10 text-center">
          <p className="max-w-[460px] type-body-md text-fg-secondary">
            {monthLabel(period)} hasn’t been prepared. Preparing adds a payslip for everyone employed that month — monthly staff for the days they were employed, casuals ready for
            their days or weeks — and this month’s advance and loan repayments.
          </p>
          {canPrepare ? (
            <Button variant="primary" disabled={busy} onClick={() => void prepare()}>
              {busy ? 'Preparing…' : `Prepare ${monthLabel(period)}`}
            </Button>
          ) : (
            <p className="type-body-sm text-fg-tertiary">Your role can’t prepare payroll.</p>
          )}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
            {kpis.map((k) => (
              <KpiCard key={k.label} kpi={k} />
            ))}
          </div>

          {!approved &&
            (owner ? (
              <Alert tone="info" title="Draft — check each payslip, then approve">
                Click a row to change days worked, the rate, extras, deductions or this month’s repayments. {explainPayroll.posting()}
              </Alert>
            ) : (
              <Alert tone="info" title="Waiting for the owner to approve">
                Click a row to change days worked, extras, deductions or repayments. Once the owner approves, the month is posted to Expenses and locked.
              </Alert>
            ))}
          {approved && (
            <Alert
              tone="success"
              title={`${monthLabel(period)} is approved and locked`}
              action={
                run.expense_id ? (
                  <Link href="/expenses" className="type-label-md text-fg-brand hover:underline">
                    Posted to Expenses as Labour
                  </Link>
                ) : undefined
              }
            >
              {unpaid.length ? `${unpaid.length} of ${rows.length} payslips not marked paid yet. Tick them and use Mark paid.` : 'Every payslip is marked paid.'}
            </Alert>
          )}

          <Card>
            <CardHeader
              title={`Payslips · ${monthLabel(period)}`}
              info={explainPayroll.basic()}
              meta={<span className="type-body-sm text-fg-tertiary">{rows.length} people</span>}
            />
            <Table
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.id)}
              onRowClick={(r) => (approved ? window.open(`/print/payslip/${r.id}`, '_blank') : canEdit && setEditing(r.id))}
              rowActions={(r) => (
                <Link
                  href={`/print/payslip/${r.id}`}
                  target="_blank"
                  aria-label={`Payslip for ${r.name}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex size-8 items-center justify-center rounded-md text-icon-secondary hover:bg-subtle"
                >
                  <FileText size={16} strokeWidth={1.5} />
                </Link>
              )}
            />
            {rows.length === 0 && <p className="px-5 py-6 type-body-md text-fg-tertiary">Nobody was employed this month. Add employees under People → Employees, then Refresh.</p>}
            <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-b-xl bg-canvas px-5 py-3 type-label-md text-fg-primary">
              <span className="inline-flex items-center gap-1.5">
                Gross {formatNaira(Math.round(totals.gross))}
                <InfoTip label="Gross pay">{explainPayroll.gross()}</InfoTip>
              </span>
              <span className="inline-flex items-center gap-1.5">
                Deductions {formatNaira(Math.round(totals.deductions))}
                <InfoTip label="Deductions">{explainPayroll.deductions()}</InfoTip>
              </span>
              <span className="inline-flex items-center gap-1.5">
                Net {formatNaira(Math.round(totals.net))}
                <InfoTip label="Net pay">{explainPayroll.net()}</InfoTip>
              </span>
              {approved && <span className="text-fg-secondary">Still to pay {formatNaira(Math.round(unpaid.reduce((n, r) => n + Number(r.net), 0)))}</span>}
            </div>
          </Card>
        </>
      )}

      <Presence>
        {editingLine && run && !approved && (
          <LineDrawer
            line={editingLine}
            employee={data.employees.find((e) => e.id === editingLine.employee_id)}
            period={period}
            items={data.items.filter((i) => i.line_id === editingLine.id)}
            save={save}
            onClose={() => setEditing(null)}
          />
        )}
      </Presence>
      <Presence>
        {approving && run && <ApproveModal runId={run.id} period={period} staff={rows.length} totals={totals} save={save} onClose={() => setApproving(false)} />}
      </Presence>
      <Presence>
        {paying && (
          <PayModal
            lineIds={selected}
            total={selectedRows.reduce((n, r) => n + Number(r.net), 0)}
            save={save}
            onClose={() => {
              setPaying(false)
              setSelected([])
            }}
          />
        )}
      </Presence>
    </>
  )
}
