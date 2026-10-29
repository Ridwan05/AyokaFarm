import { Package } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { DateInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { useToast } from '../../components/ui/toastContext'
import { feedTypes } from '../../data/inventory'
import { addDays, dayMonth, todayISO } from '../../data/metrics'
import { askToReorder } from '../../data/reorders'
import { people, reorderSuggestion } from '../../data/stockMetrics'
import { useTrade } from '../../data/tradeContext'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Store Keeper can't buy — this saves a request the people who buy see on Purchases (reorder_requests). */
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
  const [saving, setSaving] = useState(false)
  const feed = inUse.find((f) => f.name === item)
  const bagsNum = Number(bags) || 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (bagsNum <= 0) return
    const feedTypeId = catalog.feedTypes.find((f) => f.name === item)?.id
    if (!feedTypeId) return toast('That feed isn’t in the list any more')
    setSaving(true)
    const problem = await askToReorder({ item: 'feed', feed_type_id: feedTypeId, quantity: bagsNum, unit: 'bags', needed_by: needed, note: note.trim() || null })
    setSaving(false)
    if (problem) return toast(problem)
    toast(`Request sent to ${manager} and ${owner}: ${bagsNum} bags of ${item} by ${dayMonth(needed)}`)
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
      subtitle={`${cap(manager)} and ${owner} see it under Purchases and place the order`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="ask-reorder" disabled={saving}>
            {saving ? 'Sending…' : `Send to ${manager}`}
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
        <Field label={`Note to ${manager}`} hint="Shown with the request on Purchases">
          {(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}
