import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { todayISO } from '../../data/metrics'
import { explainPayroll, type usePayroll } from '../../data/payroll'
import { formatNaira } from '../../lib/format'

type Props = {
  lineIds: number[]
  /** Net pay of the selected payslips, added up. */
  total: number
  save: ReturnType<typeof usePayroll>['save']
  onClose: () => void
}

const METHODS = ['Transfer', 'Cash', 'POS'] as const
const DB_METHOD = { Transfer: 'transfer', Cash: 'cash', POS: 'pos' } as const

/** Record that net pay went out for the selected payslips of an approved month. */
export function PayModal({ lineIds, total, save, onClose }: Props) {
  const toast = useToast()
  const [date, setDate] = useState(todayISO())
  const [method, setMethod] = useState<(typeof METHODS)[number]>('Transfer')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!date || date > todayISO()) return
    setBusy(true)
    const ok = await save((db) =>
      db.rpc('pay_payroll_lines', { line_ids: lineIds, paid_on: date, method: DB_METHOD[method], reference: reference.trim() || undefined }),
    )
    setBusy(false)
    if (!ok) return
    toast(`${lineIds.length} ${lineIds.length === 1 ? 'payslip' : 'payslips'} marked paid`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Mark paid"
      subtitle={`${lineIds.length} ${lineIds.length === 1 ? 'payslip' : 'payslips'}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="pay-lines" disabled={busy}>
            {busy ? 'Saving…' : 'Mark paid'}
          </Button>
        </>
      }
    >
      <form id="pay-lines" onSubmit={submit} className="flex flex-col gap-5">
        <KeyValueRow label="Net pay going out" calculated={explainPayroll.net()}>
          {formatNaira(Math.round(total))}
        </KeyValueRow>
        <Field label="Paid on" error={date > todayISO() ? 'Can’t be in the future' : undefined}>
          {(id) => <TextInput id={id} type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <SegmentedControl fullWidth label="Paid by" options={METHODS} value={method} onChange={setMethod} />
        <Field label="Reference" hint="Optional, e.g. the transfer reference">
          {(id) => <TextInput id={id} value={reference} onChange={(e) => setReference(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}
