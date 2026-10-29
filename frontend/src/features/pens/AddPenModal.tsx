import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { pens } from '../../data/pens'
import { useTrade } from '../../data/tradeContext'

type Props = { open: boolean; onClose: () => void }

export function AddPenModal({ open, onClose }: Props) {
  const toast = useToast()
  const { addPen } = useTrade()
  const nextId = Math.max(0, ...pens.map((p) => p.id)) + 1
  const [name, setName] = useState(`Pen ${nextId}`)
  const [description, setDescription] = useState('')
  const [capacity, setCapacity] = useState('1,500')
  const [submitted, setSubmitted] = useState(false)

  const capacityNum = Number(capacity.replace(/,/g, ''))
  const errors = {
    name: name.trim() ? undefined : 'Give the pen a name',
    capacity: capacityNum > 0 ? undefined : 'Enter how many birds it holds',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || errors.capacity) return
    if (!(await addPen({ name: name.trim(), capacity: capacityNum, description: description.trim() }))) return
    toast(`${name} added`)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a pen"
      subtitle="A house or section where one flock lives at a time"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-pen">
            Add pen
          </Button>
        </>
      }
    >
      <form id="add-pen" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Pen name" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Description" hint="Optional, e.g. ‘Deep litter house by the borehole’. The flock placed decides the bird type.">
          {(id) => <TextInput id={id} value={description} placeholder="Where it is, how it’s built" onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <div className="flex gap-3">
          <Field label="Capacity" className="flex-1" error={submitted ? errors.capacity : undefined}>
            {(id) => (
              <TextInput
                id={id}
                inputMode="numeric"
                suffix="birds"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                onBlur={() => capacityNum > 0 && setCapacity(capacityNum.toLocaleString('en-NG'))}
              />
            )}
          </Field>
        </div>
        <Alert title="Empty until a flock is placed">
          Missing-entry reminders and feed targets start when you place a flock in this pen. Assign its attendant in Settings → Staff.
        </Alert>
      </form>
    </Modal>
  )
}
