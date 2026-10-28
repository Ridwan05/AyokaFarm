import { Package } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Checkbox, DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { feedTypes, reorderSuggestion } from '../../data/inventory'
import { useTrade } from '../../data/tradeContext'

/** Store Keeper can't buy — this asks the farm manager on WhatsApp. */
export function AskReorderModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { stockOf } = useTrade()
  const inUse = feedTypes.filter((f) => f.daysOfCover !== null)
  const [item, setItem] = useState(reorderSuggestion.feed)
  const [bags, setBags] = useState(String(reorderSuggestion.bags))
  const [needed, setNeeded] = useState('2026-10-12')
  const [note, setNote] = useState(`Same as last time from ${reorderSuggestion.supplier}? They delivered on ${reorderSuggestion.lastDate}.`)
  const [alsoOwner, setAlsoOwner] = useState(true)
  const feed = inUse.find((f) => f.name === item)!
  const bagsNum = Number(bags) || 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (bagsNum <= 0) return
    toast(`Sent to Emeka${alsoOwner ? ' and Adeola' : ''} on WhatsApp`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ask Emeka to reorder"
      subtitle="Emeka decides and Adeola places the order"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="ask-reorder">
            Send to Emeka
          </Button>
        </>
      }
    >
      <form id="ask-reorder" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Item" hint={`${stockOf(feed.name, feed.bags)} bags in store · ${feed.bagsPerDay} a day · about ${feed.daysOfCover} days of cover`}>
          {(id) => <SelectInput id={id} leadingIcon={Package} value={item} onChange={(e) => setItem(e.target.value)} options={inUse.map((f) => ({ value: f.name, label: f.name }))} />}
        </Field>
        <div className="flex gap-3">
          <Field label="Bags to order" className="flex-1" error={bagsNum > 0 ? undefined : 'Enter how many bags'}>
            {(id) => <TextInput id={id} inputMode="numeric" suffix="bags" value={bags} onChange={(e) => setBags(e.target.value)} />}
          </Field>
          <Field label="Needed by" className="flex-1">
            {(id) => <DateInput id={id} value={needed} onChange={(e) => setNeeded(e.target.value)} />}
          </Field>
        </div>
        <Field label="Note to Emeka" hint="Emeka gets this on WhatsApp">
          {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <Checkbox label="Also tell Adeola" checked={alsoOwner} onChange={setAlsoOwner} />
      </form>
    </Modal>
  )
}
