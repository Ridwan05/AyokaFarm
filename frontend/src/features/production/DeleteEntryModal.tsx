import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { penName } from '../../data/farmViews'
import { weekdayDayMonth } from '../../data/metrics'
import type { DailyRow } from '../../data/remote'
import { useTrade } from '../../data/tradeContext'

/** Owner: remove a daily entry with a reason. Its feed and medication go back to stock. */
export function DeleteEntryModal({ row, onClose }: { row: DailyRow; onClose: () => void }) {
  const { catalog, deleteProductionRecord } = useTrade()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const pen = penName(catalog, row.penId)
  const error = reason.trim().length < 3 ? 'Say why it’s being deleted' : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (error) return
    setSaving(true)
    const ok = await deleteProductionRecord(row.id, reason.trim())
    setSaving(false)
    if (!ok) return
    toast(`${pen} entry for ${weekdayDayMonth(row.date)} deleted`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${pen} entry · ${weekdayDayMonth(row.date)}`}
      subtitle={`Recorded by ${row.recordedBy}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="danger" className="flex-1" type="submit" form="delete-entry" disabled={saving}>
            {saving ? 'Deleting…' : 'Delete entry'}
          </Button>
        </>
      }
    >
      <form id="delete-entry" onSubmit={submit} className="flex flex-col gap-4">
        <p className="type-body-md text-fg-secondary">
          The entry stays in the audit log with your reason. Its feed and medication go back into stock, and the pen’s later bird counts are worked out again.
        </p>
        <Field label="Reason" error={submitted ? error : undefined}>
          {(id) => <TextInput id={id} value={reason} placeholder="e.g. Entered twice by mistake" onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}
