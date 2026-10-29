import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { explainPayroll, monthLabel, type usePayroll } from '../../data/payroll'
import { formatNaira } from '../../lib/format'

type Props = {
  runId: number
  period: string
  staff: number
  totals: { gross: number; deductions: number; net: number }
  save: ReturnType<typeof usePayroll>['save']
  onClose: () => void
}

/** Owner: lock the month and post total gross pay as one Labour expense. */
export function ApproveModal({ runId, period, staff, totals, save, onClose }: Props) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const approve = async () => {
    setBusy(true)
    const ok = await save((db) => db.rpc('approve_payroll', { run_id: runId }))
    setBusy(false)
    if (!ok) return
    toast(`${monthLabel(period)} approved and posted to Expenses`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Approve ${monthLabel(period)}`}
      subtitle={`${staff} ${staff === 1 ? 'payslip' : 'payslips'}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" disabled={busy} onClick={() => void approve()}>
            {busy ? 'Approving…' : 'Approve & post'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          <KeyValueRow label="Gross pay" calculated={explainPayroll.gross()}>
            {formatNaira(Math.round(totals.gross))}
          </KeyValueRow>
          <KeyValueRow label="Deductions" calculated={explainPayroll.deductions()}>
            − {formatNaira(Math.round(totals.deductions))}
          </KeyValueRow>
          <KeyValueRow label="Net pay" strong calculated={explainPayroll.net()}>
            {formatNaira(Math.round(totals.net))}
          </KeyValueRow>
        </div>
        <Alert tone="info" title="What approving does">
          {explainPayroll.posting()} The month is then locked: payslips can’t change, only be marked paid. Repayments come off each advance and loan.
        </Alert>
      </div>
    </Modal>
  )
}
