import { Printer } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Card, CardHeader } from '../../components/ui/Card'
import { InfoTip } from '../../components/ui/InfoTip'
import { weekdayDm } from '../../data/metrics'
import { explainPayroll, monthLabel, type PayrollLine, type PayrollRun } from '../../data/payroll'
import { formatNaira } from '../../lib/format'

/** Payslips from approved months, newest first, each with a printable payslip. */
export function PayslipsCard({ payslips }: { payslips: { line: PayrollLine; run: PayrollRun }[] }) {
  return (
    <Card>
      <CardHeader title="Payslips" meta={<span className="type-body-sm text-fg-tertiary">{payslips.length ? `${payslips.length} approved` : 'From approved months'}</span>} />
      {payslips.length ? (
        <ul className="flex flex-col">
          {payslips.map(({ line, run }) => (
            <li key={line.id} className="flex items-center gap-3 border-t border-line-subtle px-5 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="type-label-md text-fg-primary">{monthLabel(run.period)}</span>
                <span className="type-body-sm text-fg-secondary">
                  Gross {formatNaira(Number(line.gross))} · deductions {formatNaira(Number(line.deductions))}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="flex items-center gap-1 type-label-md text-fg-primary">
                  {formatNaira(Number(line.net))}
                  <InfoTip label="Net pay">{explainPayroll.net()}</InfoTip>
                </span>
                {line.paid_on ? (
                  <Badge tone="success">Paid {weekdayDm(line.paid_on)}</Badge>
                ) : (
                  <Badge tone="warning">Not paid yet</Badge>
                )}
              </span>
              <a
                href={`/print/payslip/${line.id}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Print the ${monthLabel(run.period)} payslip`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-icon-secondary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94]"
              >
                <Printer size={16} strokeWidth={1.5} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line-subtle px-5 py-4 type-body-md text-fg-tertiary">No payslips yet. They appear here once a month’s payroll is approved.</p>
      )}
    </Card>
  )
}
