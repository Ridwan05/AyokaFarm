import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/toastContext'
import type { Catalog } from '../../data/remote'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

type Props = { pen: Catalog['allPens'][number]; onClose: () => void }

/** Owner only: rename a pen, change its capacity or description, or take it out of use. */
export function EditPenModal({ pen, onClose }: Props) {
  const toast = useToast()
  const { updatePen, history } = useTrade()
  const [name, setName] = useState(pen.name)
  const [capacity, setCapacity] = useState(formatNumber(pen.capacity))
  const [description, setDescription] = useState(pen.description ?? '')
  const [active, setActive] = useState(pen.is_active)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const flock = history.flocks.find((f) => f.pen_id === pen.id && f.status === 'active')
  const capacityNum = Number(capacity.replace(/,/g, ''))
  const errors = {
    name: name.trim() ? undefined : 'Give the pen a name',
    capacity: capacityNum > 0 ? undefined : 'Enter how many birds it holds',
    active: !active && flock ? `Close flock ${flock.code} before taking the pen out of use` : undefined,
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || errors.capacity || errors.active) return
    setBusy(true)
    const ok = await updatePen(pen.id, { name: name.trim(), capacity: capacityNum, description: description.trim() || null, is_active: active })
    setBusy(false)
    if (!ok) return
    toast(`${name.trim()} saved`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${pen.name}`}
      subtitle="Only the owner can change pen details"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="edit-pen" disabled={busy}>
            {busy ? 'Saving…' : 'Save pen'}
          </Button>
        </>
      }
    >
      <form id="edit-pen" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Pen name" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Capacity" error={submitted ? errors.capacity : undefined}>
          {(id) => (
            <TextInput
              id={id}
              inputMode="numeric"
              suffix="birds"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              onBlur={() => capacityNum > 0 && setCapacity(formatNumber(capacityNum))}
            />
          )}
        </Field>
        <Field label="Description" hint="Optional. The flock placed decides the bird type.">
          {(id) => <TextInput id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Switch label="In use" checked={active} onChange={setActive} />
        {errors.active ? (
          <p className="type-body-sm text-fg-danger">{errors.active}</p>
        ) : (
          !active && (
            <Alert tone="warning" title="Out of use">
              The pen disappears from Pens and from Place flock until it’s back in use. Its past flocks and records stay.
            </Alert>
          )
        )}
      </form>
    </Modal>
  )
}
