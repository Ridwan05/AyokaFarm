'use client'

import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { KeyValueRow } from '../components/ui/KeyValueRow'
import { explainPayroll, usePayroll } from '../data/payroll'
import { useCurrentUser } from '../data/sessionContext'
import { approvedPayslips, owedBy, payText } from '../features/employees/employeeView'
import { LoansCard } from '../features/employees/LoansCard'
import { PayrollState } from '../features/employees/PayrollState'
import { PayslipsCard } from '../features/employees/PayslipsCard'
import { formatNaira } from '../lib/format'

/** Anyone's own payslips and advances or loans. The database only returns their own records. */
export default function MyPay() {
  const user = useCurrentUser()
  const { data, loaded, error, reload } = usePayroll()
  const me = data.employees.find((e) => e.profile_id === user.id)

  return (
    <>
      <PageHeader eyebrow={['You', 'My pay']} title="My pay" description="Your payslips and any salary advance or loan you’re repaying." />
      {!loaded ? (
        <PayrollState error={error} onRetry={() => void reload()} />
      ) : !me ? (
        <Card className="items-center gap-2 p-10 text-center">
          <p className="type-label-md text-fg-primary">You’re not on the payroll in the app yet</p>
          <p className="max-w-[420px] type-body-sm text-fg-secondary">Ask the owner to add you under People → Employees and link your login. Your payslips will then show here.</p>
        </Card>
      ) : (
        <>
          <Card className="gap-1 px-5 pt-4 pb-5">
            <h2 className="pb-2 type-h3 text-fg-primary">{me.full_name}</h2>
            {me.job_title && <KeyValueRow label="Job">{me.job_title}</KeyValueRow>}
            <KeyValueRow label="Pay">{Number(me.pay_rate) ? payText(me) : 'Not set yet'}</KeyValueRow>
            <KeyValueRow label="Owed on advances & loans" calculated={explainPayroll.loanBalance()}>
              {formatNaira(owedBy(data.balances, me.id))}
            </KeyValueRow>
          </Card>
          <PayslipsCard payslips={approvedPayslips(data, me.id)} />
          <LoansCard loans={data.loans.filter((l) => l.employee_id === me.id)} balances={data.balances} />
        </>
      )}
    </>
  )
}
