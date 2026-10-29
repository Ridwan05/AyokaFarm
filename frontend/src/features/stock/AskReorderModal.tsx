import { Package } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Checkbox, DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { feedTypes } from '../../data/inventory'
import { addDays, dayMonth, todayISO } from '../../data/metrics'
import { people, reorderSuggestion } from '../../data/stockMetrics'
import { useTrade } from '../../data/tradeContext'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Store Keeper can't buy — this asks the farm manager. WhatsApp isn't connected yet, so it's passed on in person. */
export function AskReorderModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { stockOf, history, catalog } = useTrade()
  const inUse = feedTypes.filter((f) => f.daysOfCover !== null)
  const suggestion = reorderSuggestion(history, catalog, feedTypes)
  const { manager, owner } = people(catalog)
  const [item, setItem] = useState(suggestion?.feed ?? inUse[0]?.name ?? '')
  const [bags, setBags] = useState(String(suggestion?.bags ?? ''))
  // Needed a day before it runs out, but not in the past.
  const [needed, setNeeded] = useState(() => {
    const d = suggestion ? addDays(suggestion.runsOutOn, -1) : addDays(todayISO(), 3)
    return d < todayISO() ? todayISO() : d
  })
  const [note, setNote] = useState(
    suggestion?.supplier ? `Same as last time from ${suggestion.supplier}?${suggestion.lastDate ? ` Last bought on ${dayMonth(suggestion.lastDate)}.` : ''}` : '',
  )
  const [alsoOwner, setAlsoOwner] = useState(true)
  const feed = inUse.find((f) => f.name === item)
  const bagsNum = Number(bags) || 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (bagsNum <= 0) return
    toast(`WhatsApp isn’t connected yet — please tell ${manager}${alsoOwner ? ` and ${owner}` : ''}: ${bagsNum} bags of ${item} by ${dayMonth(needed)}`)
    onClose()
  }

  if (!feed) {
    return (
      <Modal open onClose={onClose} title="Ask to reorder" footer={<Button size="lg" className="flex-1" onClick={onClose}>Close</Button>}>
        <p className="type-body-md text-fg-secondary">No feed is in use at the moment, so there’s nothing to reorder.</p>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ask ${manager} to reorder`}
      subtitle={`${cap(manager)} decides and ${owner} places the order`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="ask-reorder">
            Send to {manager}
          </Button>
        </>
      }
    >
      <form id="ask-reorder" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Item" hint={`${stockOf(feed.name)} bags in store · ${feed.bagsPerDay} a day · about ${feed.daysOfCover} days of cover`}>
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
        <Field label={`Note to ${manager}`} hint="WhatsApp isn’t connected yet">
          {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <Checkbox label={`Also tell ${owner}`} checked={alsoOwner} onChange={setAlsoOwner} />
      </form>
    </Modal>
  )
}
