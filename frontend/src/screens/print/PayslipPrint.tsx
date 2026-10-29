'use client'

import { useParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Card } from '../../components/ui/Card'
import { monthLabel, PAY_BASIS_LABEL, PAY_UNIT, usePayroll } from '../../data/payroll'
import { daysInMonth, ITEM_KIND_LABEL, loanLeftAfter, METHOD_LABEL, workedLabel } from '../../features/payroll/payrollView'
import { PrintSheet } from '../../features/print/PrintSheet'
import { dmy, money } from '../../features/print/printFormat'

/** A printable payslip. Staff see their own approved payslips; payroll staff see any. */
export default function PayslipPrint() {
  const { lineId = '' } = useParams<{ lineId: string }>()
  const payroll = usePayroll()
  const { data, loaded, error } = payroll
  const line = data.lines.find((l) => l.id === Number(lineId))
  const run = line && data.runs.find((r) => r.id === line.run_id)

  if (error || !loaded || !line || !run) {
    return (
      <>
        <PageHeader title="Payslip" />
        <Card className="items-center p-12">
          <p className="max-w-[440px] text-center type-body-md text-fg-tertiary">
            {error
              ? `Couldn’t load the payslip: ${error}`
              : !loaded
                ? 'Loading payslip…'
                : 'Payslip not found. You can see your own payslips once a month is approved, or any payslip if payroll is part of your role.'}
          </p>
        </Card>
      </>
    )
  }

  const employee = data.employees.find((e) => e.id === line.employee_id)
  const items = data.items.filter((i) => i.line_id === line.id)
  const extras = items.filter((i) => i.kind === 'earning')
  const deductions = items.filter((i) => i.kind !== 'earning')
  const units = Number(line.units)
  const monthly = line.pay_basis === 'monthly'
  const basicHow = monthly
    ? units >= 1
      ? `${money(Number(line.rate))} a month`
      : `${money(Number(line.rate))} a month × ${Math.round(units * daysInMonth(run.period))}/${daysInMonth(run.period)} days employed`
    : `${money(Number(line.rate))} ${PAY_UNIT[line.pay_basis]} × ${workedLabel(line.pay_basis, units, run.period)}`

  return (
    <PrintSheet kind="Payslip" docRef={`${monthLabel(run.period)} · #${line.id}`}>
      <h1 className="sr-only">
        Payslip for {employee?.full_name} · {monthLabel(run.period)}
      </h1>
      {run.status !== 'approved' && (
        <p className="rounded-md bg-warning-subtle px-3 py-2 type-label-md text-fg-warning">Draft — this month isn’t approved yet, so the figures may still change.</p>
      )}
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <Fact label="Employee">{employee?.full_name ?? '—'}</Fact>
        {employee?.job_title && <Fact label="Job">{employee.job_title}</Fact>}
        <Fact label="Pay period">{monthLabel(run.period)}</Fact>
        <Fact label="Pay basis">{PAY_BASIS_LABEL[line.pay_basis]}</Fact>
      </div>

      <section className="flex flex-col gap-1.5">
        <h2 className="type-overline text-fg-tertiary">Pay</h2>
        <Row label="Basic pay" detail={basicHow}>
          {money(Number(line.basic))}
        </Row>
        {extras.map((i) => (
          <Row key={i.id} label={i.label} detail={ITEM_KIND_LABEL[i.kind]}>
            {money(Number(i.amount))}
          </Row>
        ))}
        <Row label="Gross pay" strong>
          {money(Number(line.gross))}
        </Row>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="type-overline text-fg-tertiary">Deductions</h2>
        {deductions.length ? (
          deductions.map((i) => {
            const left = i.loan_id ? loanLeftAfter(data, i.loan_id, line) : null
            const detail = i.loan_id && left !== null ? `${ITEM_KIND_LABEL[i.kind]} · ${money(Math.max(left, 0))} left after this payslip` : ITEM_KIND_LABEL[i.kind]
            return (
              <Row key={i.id} label={i.label} detail={detail}>
                − {money(Number(i.amount))}
              </Row>
            )
          })
        ) : (
          <p className="type-body-md text-fg-secondary">None</p>
        )}
        <Row label="Total deductions" strong>
          − {money(Number(line.deductions))}
        </Row>
      </section>

      <div className="ml-auto flex w-full max-w-[340px] flex-col gap-1.5 border-t border-line pt-3">
        <Row label="Net pay" strong>
          {money(Number(line.net))}
        </Row>
        <span className="text-right type-body-sm text-fg-secondary">
          {line.paid_on
            ? `Paid ${dmy(line.paid_on)}${line.payment_method ? ` · ${METHOD_LABEL[line.payment_method]}` : ''}${line.payment_ref ? ` · ${line.payment_ref}` : ''}`
            : 'Not paid yet'}
        </span>
      </div>

      {(employee?.bank_name || employee?.account_number) && (
        <div className="flex flex-wrap gap-x-10 gap-y-3 border-t border-line pt-4">
          {employee.bank_name && <Fact label="Bank">{employee.bank_name}</Fact>}
          {employee.account_number && <Fact label="Account">{employee.account_number}</Fact>}
          {employee.account_name && <Fact label="Account name">{employee.account_name}</Fact>}
        </div>
      )}
    </PrintSheet>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="type-overline text-fg-tertiary">{label}</span>
      <span className="type-label-lg">{children}</span>
    </div>
  )
}

function Row({ label, detail, strong, children }: { label: string; detail?: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={strong ? 'type-label-md' : 'type-body-md'}>{label}</span>
        {detail && <span className="type-body-sm text-fg-tertiary">{detail}</span>}
      </span>
      <span className={strong ? 'type-numeric-lg' : 'type-numeric-md'}>{children}</span>
    </div>
  )
}
