import { Plus } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { InfoTip } from '../../components/ui/InfoTip'
import { todayISO, weekdayDm } from '../../data/metrics'
import { explainPayroll, LOAN_STATUS_LABEL, type Loan, type LoanBalance, type usePayroll } from '../../data/payroll'
import { formatNaira } from '../../lib/format'
import { balanceOf, LOAN_KIND_LABEL, loanTone, nextRepayment, scheduleText, shortMonth } from './employeeView'
import { LoanActions } from './LoanActions'

type Props = {
  loans: Loan[]
  balances: LoanBalance[]
  /** Show the owner's approve / change / cancel actions. */
  ownerActions?: boolean
  save?: ReturnType<typeof usePayroll>['save']
  onAdd?: () => void
  addLabel?: string
}

/** Advances and loans with what's left, the schedule and the next repayment. */
export function LoansCard({ loans, balances, ownerActions, save, onAdd, addLabel = 'Advance or loan…' }: Props) {
  const today = todayISO()
  const owed = loans.filter((l) => l.status === 'active').reduce((n, l) => n + Math.max(0, Number(balanceOf(balances, l.id)?.balance ?? 0)), 0)
  return (
    <Card>
      <CardHeader
        title="Advances & loans"
        info={explainPayroll.loanBalance()}
        meta={<span className="type-body-sm text-fg-tertiary">{owed > 0 ? `${formatNaira(owed)} to repay` : 'Nothing owed'}</span>}
      />
      {onAdd && (
        <div className="px-5 pb-3">
          <Button size="sm" leadingIcon={Plus} onClick={onAdd}>
            {addLabel}
          </Button>
        </div>
      )}
      {loans.length ? (
        <ul className="flex flex-col">
          {loans.map((l) => {
            const b = balanceOf(balances, l.id)
            const left = Math.max(0, Number(b?.balance ?? l.amount))
            const next = b ? nextRepayment(b, today) : null
            return (
              <li key={l.id} className="flex items-start gap-3 border-t border-line-subtle px-5 py-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="type-label-md text-fg-primary">
                      {LOAN_KIND_LABEL[l.kind]} · {formatNaira(Number(l.amount))}
                    </span>
                    <Badge dot tone={loanTone(l.status)}>
                      {LOAN_STATUS_LABEL[l.status]}
                    </Badge>
                  </span>
                  <span className="type-body-sm text-fg-secondary">
                    {l.ref} · paid out {weekdayDm(l.issued_on)}
                    {l.reason ? ` · ${l.reason}` : ''}
                  </span>
                  <span className="type-body-sm text-fg-tertiary">{scheduleText(Number(l.amount), Number(l.monthly_repayment), l.first_month)}</span>
                  {next && (
                    <span className="type-body-sm text-fg-secondary">
                      Next: {formatNaira(next.amount)} off the {shortMonth(next.month)} payslip
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="flex items-center gap-1 type-label-md text-fg-primary">
                    {l.status === 'cancelled' ? '—' : formatNaira(left)}
                    <InfoTip label="Left to repay">{explainPayroll.loanBalance()}</InfoTip>
                  </span>
                  {l.status === 'active' && b?.months_left ? (
                    <span className="type-body-sm text-fg-tertiary">
                      {b.months_left} month{b.months_left === 1 ? '' : 's'} left
                    </span>
                  ) : null}
                </span>
                {ownerActions && save && <LoanActions loan={l} balance={b} save={save} />}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="border-t border-line-subtle px-5 py-4 type-body-md text-fg-tertiary">No advances or loans.</p>
      )}
    </Card>
  )
}
