import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { penNameTaken } from '../../data/farmViews'
import { useTrade } from '../../data/tradeContext'

type Props = { open: boolean; onClose: () => void }

/** Add an empty pen with its name, capacity and an optional description. */
export function AddPenModal({ open, onClose }: Props) {
  const toast = useToast()
  const { addPen, catalog } = useTrade()
  // Suggest the next free "Pen N", counting pens taken out of use (names stay unique).
  const [name, setName] = useState(() => {
    let n = catalog.allPens.length + 1
    while (penNameTaken(catalog, `Pen ${n}`)) n++
    return `Pen ${n}`
  })
  const [description, setDescription] = useState('')
  const [capacity, setCapacity] = useState('1,500')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const capacityNum = Number(capacity.replace(/,/g, ''))
  const errors = {
    name: !name.trim() ? 'Give the pen a name' : penNameTaken(catalog, name) ? 'Another pen already has this name' : undefined,
    capacity: capacityNum > 0 ? undefined : 'Enter how many birds it holds',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // A second tap while saving would add the pen twice.
    if (saving) return
    setSubmitted(true)
    if (errors.name || errors.capacity) return
    setSaving(true)
    // Collapse double spaces so "Pen  3" and "Pen 3" can't both exist.
    const ok = await addPen({ name: name.trim().replace(/\s+/g, ' '), capacity: capacityNum, description: description.trim() }).finally(() => setSaving(false))
    if (!ok) return
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
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-pen" disabled={saving}>
            {saving ? 'Saving…' : 'Add pen'}
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
