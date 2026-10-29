'use client'

import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { SearchInput } from '../../components/ui/Form'
import { KpiCard } from '../../components/ui/KpiCard'
import type { Kpi } from '../../components/ui/KpiCard'
import { Presence } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { nairaKpi } from '../../data/metrics'
import { explainPayroll, PAY_BASIS_LABEL, usePayroll, type Employee } from '../../data/payroll'
import { initialsOf } from '../../data/session'
import { useCurrentUser } from '../../data/sessionContext'
import { EmployeeModal } from '../../features/employees/EmployeeModal'
import { employeeStatus, isWorking, owedBy, payText } from '../../features/employees/employeeView'
import { PayrollState } from '../../features/employees/PayrollState'
import { can } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { formatNaira } from '../../lib/format'

const TABS = ['Working', 'Casual', 'Left', 'All'] as const

const tile = (label: string, value: string, unit: string, context: string, info: string): Kpi => ({
  label,
  value,
  unit,
  delta: '',
  trend: 'flat',
  sentiment: 'neutral',
  context,
  info,
  spark: [0, 0],
})

export default function Employees() {
  const router = useRouter()
  const user = useCurrentUser()
  const { data, loaded, error, reload, save } = usePayroll()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Working')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const working = data.employees.filter(isWorking)
  const monthlyBill = working.filter((e) => e.pay_basis === 'monthly').reduce((n, e) => n + Number(e.pay_rate), 0)
  const casuals = working.filter((e) => e.pay_basis !== 'monthly').length
  const owed = data.employees.reduce((n, e) => n + owedBy(data.balances, e.id), 0)
  const pending = data.loans.filter((l) => l.status === 'pending').length
  const bill = nairaKpi(monthlyBill)
  const loans = nairaKpi(owed)
  const kpis = [
    tile('Working here', String(working.length), 'people', `${working.filter((e) => e.profile_id).length} with an app login · ${casuals} casual`, 'Employees marked as working (not left), with or without an app login.'),
    tile('Monthly salaries', bill.value, bill.unit, casuals ? `+ ${casuals} casual${casuals === 1 ? '' : 's'} by days or weeks worked` : 'Monthly staff only', 'Monthly salaries of everyone working here added up. Casuals are paid for the days or weeks they work, so they’re not included.'),
    tile('Advances & loans owed', loans.value, loans.unit, pending ? `${pending} waiting for approval` : 'Nothing waiting', explainPayroll.loanBalance()),
  ]

  const q = query.trim().toLowerCase()
  const rows = data.employees
    .filter((e) => (tab === 'Working' ? isWorking(e) : tab === 'Casual' ? isWorking(e) && e.pay_basis !== 'monthly' : tab === 'Left' ? !isWorking(e) : true))
    .filter((e) => !q || e.full_name.toLowerCase().includes(q) || (e.job_title ?? '').toLowerCase().includes(q))

  const columns: Column<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      render: (e) => <PrimaryCell initials={initialsOf(e.full_name)} title={e.full_name} subtitle={e.profile_id ? 'App login' : 'No login'} />,
    },
    { key: 'job', header: 'Job', width: 150, render: (e) => <TextCell>{e.job_title ?? '—'}</TextCell> },
    { key: 'pay', header: 'Pay', width: 170, render: (e) => <TextCell>{Number(e.pay_rate) ? payText(e) : 'Not set yet'}</TextCell> },
    {
      key: 'owed',
      header: 'Owes on loans',
      align: 'right',
      width: 130,
      render: (e) => {
        const n = owedBy(data.balances, e.id)
        return n ? <NumberCell>{formatNaira(n)}</NumberCell> : <NumberCell tone="muted">—</NumberCell>
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: 110,
      render: (e) => {
        const s = employeeStatus(e)
        return (
          <Badge dot tone={s.tone}>
            {s.label}
          </Badge>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow={['People', 'Employees']}
        title="Employees"
        description="Everyone on the payroll — staff who use the app and casual workers who don’t."
        actions={
          <>
            <Button
              leadingIcon={Download}
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  'employees',
                  ['Name', 'Job', 'Pay basis', 'Rate (₦)', 'Started', 'Left', 'App login', 'Bank', 'Account number', 'Account name', 'Owes on loans (₦)'],
                  rows.map((e) => [e.full_name, e.job_title, PAY_BASIS_LABEL[e.pay_basis], Number(e.pay_rate), e.started_on, e.left_on, e.profile_id ? 'Yes' : 'No', e.bank_name, e.account_number, e.account_name, owedBy(data.balances, e.id)]),
                )
              }
            >
              Export
            </Button>
            {can(user, 'payroll', 'add') && (
              <Button variant="primary" leadingIcon={Plus} onClick={() => setAdding(true)} disabled={!loaded}>
                Add employee
              </Button>
            )}
          </>
        }
      />

      {!loaded ? (
        <PayrollState error={error} onRetry={() => void reload()} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:gap-4">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} kpi={kpi} />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl label="Employees" options={TABS} value={tab} onChange={setTab} />
            <span className="flex-1" />
            <SearchInput label="Search employees" placeholder="Search name or job" width={240} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <Card>
            <CardHeader title={tab === 'All' ? 'Everyone' : tab} meta={<span className="type-body-sm text-fg-tertiary">{rows.length} people</span>} />
            {rows.length ? (
              <Table columns={columns} rows={rows} rowKey={(e) => String(e.id)} onRowClick={(e) => router.push(`/employees/${e.id}`)} />
            ) : (
              <p className="px-5 pb-6 type-body-md text-fg-tertiary">{data.employees.length ? 'Nobody matches.' : 'No employees yet. Add the people you pay, including casual workers.'}</p>
            )}
          </Card>
        </>
      )}

      <Presence>{adding && <EmployeeModal employees={data.employees} save={save} onClose={() => setAdding(false)} />}</Presence>
    </>
  )
}
