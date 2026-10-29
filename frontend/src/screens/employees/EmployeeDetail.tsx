'use client'

import { HandCoins, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Presence } from '../../components/ui/Overlay'
import { dayMonth, todayISO } from '../../data/metrics'
import { explainPayroll, PAY_BASIS_LABEL, usePayroll } from '../../data/payroll'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { EmployeeModal } from '../../features/employees/EmployeeModal'
import { approvedPayslips, employeeStatus, owedBy, payText } from '../../features/employees/employeeView'
import { LoanDrawer } from '../../features/employees/LoanDrawer'
import { LoansCard } from '../../features/employees/LoansCard'
import { PayrollState } from '../../features/employees/PayrollState'
import { PayslipsCard } from '../../features/employees/PayslipsCard'
import { can } from '../../lib/access'
import { formatNaira } from '../../lib/format'
import Placeholder from '../Placeholder'

const date = (iso: string) => `${dayMonth(iso)} ${iso.slice(0, 4)}`

export default function EmployeeDetail() {
  const { employeeId = '' } = useParams<{ employeeId: string }>()
  const user = useCurrentUser()
  const { catalog } = useTrade()
  const { data, loaded, error, reload, save } = usePayroll()
  const [overlay, setOverlay] = useState<'edit' | 'loan' | null>(null)

  if (!loaded) {
    return (
      <>
        <PageHeader backTo="/employees" eyebrow={['People', 'Employees']} title="Employee" />
        <PayrollState error={error} onRetry={() => void reload()} />
      </>
    )
  }
  const e = data.employees.find((x) => String(x.id) === employeeId)
  if (!e) return <Placeholder title="Employee not found" />

  const status = employeeStatus(e)
  const login = e.profile_id ? catalog.profiles.find((p) => p.id === e.profile_id) : undefined
  const loans = data.loans.filter((l) => l.employee_id === e.id)
  const payslips = approvedPayslips(data, e.id)
  const paidThisYear = payslips.filter((p) => p.run.period.slice(0, 4) === todayISO().slice(0, 4)).reduce((n, p) => n + Number(p.line.net), 0)

  return (
    <>
      <PageHeader
        backTo="/employees"
        eyebrow={['Employees', e.full_name]}
        title={e.full_name}
        description={[e.job_title, Number(e.pay_rate) ? payText(e) : 'Pay not set yet', login ? `App login: ${login.full_name}` : 'No app login'].filter(Boolean).join(' · ')}
        actions={
          <>
            {can(user, 'payroll', 'edit') && (
              <Button leadingIcon={Pencil} onClick={() => setOverlay('edit')}>
                Edit
              </Button>
            )}
            {can(user, 'payroll', 'add') && (
              <Button variant="primary" leadingIcon={HandCoins} onClick={() => setOverlay('loan')}>
                {user.role === 'owner' ? 'Advance or loan' : 'Request advance or loan'}
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1 gap-1 px-5 pt-4 pb-5">
          <div className="flex items-center gap-2 pb-2">
            <h2 className="flex-1 type-h3 text-fg-primary">Pay</h2>
            <Badge dot tone={status.tone}>
              {status.label}
            </Badge>
          </div>
          <KeyValueRow label="Paid by">{PAY_BASIS_LABEL[e.pay_basis]}</KeyValueRow>
          <KeyValueRow label="Rate">{Number(e.pay_rate) ? payText(e) : 'Not set yet'}</KeyValueRow>
          <KeyValueRow label="Started">{date(e.started_on)}</KeyValueRow>
          {e.left_on && <KeyValueRow label="Left">{date(e.left_on)}</KeyValueRow>}
          <KeyValueRow label="Owes on advances & loans" calculated={explainPayroll.loanBalance()}>
            {formatNaira(owedBy(data.balances, e.id))}
          </KeyValueRow>
          <KeyValueRow label="Net pay this year" calculated="Net pay on this year’s approved payslips added up.">
            {formatNaira(paidThisYear)}
          </KeyValueRow>
          {e.phone && <KeyValueRow label="Phone">{e.phone}</KeyValueRow>}
          {e.notes && <p className="pt-2 type-body-sm text-fg-secondary">{e.notes}</p>}
        </Card>
        <Card className="w-full shrink-0 gap-1 px-5 pt-4 pb-5 lg:w-[360px]">
          <h2 className="pb-2 type-h3 text-fg-primary">Bank</h2>
          {e.bank_name || e.account_number ? (
            <>
              <KeyValueRow label="Bank">{e.bank_name ?? '—'}</KeyValueRow>
              <KeyValueRow label="Account number">{e.account_number ?? '—'}</KeyValueRow>
              <KeyValueRow label="Account name">{e.account_name ?? '—'}</KeyValueRow>
            </>
          ) : (
            <p className="type-body-md text-fg-tertiary">No bank details — paid in cash.</p>
          )}
        </Card>
      </div>

      <LoansCard
        loans={loans}
        balances={data.balances}
        ownerActions={user.role === 'owner'}
        save={save}
        onAdd={can(user, 'payroll', 'add') ? () => setOverlay('loan') : undefined}
        addLabel={user.role === 'owner' ? 'Record advance or loan…' : 'Request advance or loan…'}
      />
      <PayslipsCard payslips={payslips} />

      <Presence>
        {overlay === 'edit' && <EmployeeModal employee={e} employees={data.employees} save={save} onClose={() => setOverlay(null)} />}
        {overlay === 'loan' && <LoanDrawer employee={e} save={save} onClose={() => setOverlay(null)} />}
      </Presence>
    </>
  )
}
