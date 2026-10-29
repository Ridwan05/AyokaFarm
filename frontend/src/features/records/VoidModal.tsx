import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { useTrade, type MoneyKind } from '../../data/tradeContext'
import { KIND_LABEL } from './recordRules'

const EFFECT: Record<MoneyKind, string> = {
  sales: 'It leaves sales, the customer’s balance and the reports. Eggs go back into the store and birds back on the flock.',
  purchases: 'It leaves purchases, the supplier’s balance and the reports. Stock it brought in comes out again.',
  payments: 'It leaves payments; the bills it cleared are owed again.',
  expenses: 'It leaves expenses, the supplier’s balance (if any) and the reports.',
}

/** Owner: void a sale, purchase, payment or expense with a reason. The audit log keeps it. */
export function VoidModal({ kind, refId, label, onClose, onVoided }: { kind: MoneyKind; refId: string; label?: string; onClose: () => void; onVoided?: () => void }) {
  const { voidRecord } = useTrade()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const error = reason.trim().length < 3 ? 'Say why it’s being voided' : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error) return
    setSaving(true)
    const ok = await voidRecord(kind, refId, reason)
    setSaving(false)
    if (!ok) return
    toast(`${refId} voided`)
    onVoided?.()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Void ${KIND_LABEL[kind]} ${refId}`}
      subtitle={label}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="danger" className="flex-1" type="submit" form="void-record" disabled={saving}>
            {saving ? 'Voiding…' : `Void ${KIND_LABEL[kind]}`}
          </Button>
        </>
      }
    >
      <form id="void-record" onSubmit={submit} className="flex flex-col gap-4">
        <p className="type-body-md text-fg-secondary">{EFFECT[kind]} The audit log keeps the record and your reason.</p>
        <Field label="Reason" error={submitted ? error : undefined}>
          {(id) => <TextInput id={id} value={reason} placeholder="e.g. Entered twice by mistake" onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}
