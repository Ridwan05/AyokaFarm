import { Package, Truck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { AutoInput, Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { explainMoney } from '../../data/explainMoney'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import type { StockKind } from '../../data/deliveries'
import { feedTypes, medications } from '../../data/inventory'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { nowHM, todayISO, weekdayDm } from '../../data/metrics'
import { formatNumber } from '../../lib/format'

const KINDS = ['Feed', 'Medication'] as const
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

/** Store Keeper receives an order: what arrived, what went back, what goes into the store. */
export function ReceiveDeliveryDrawer({ onClose }: { onClose: () => void }) {
  const { orders, suppliers, stockOf, receiveDelivery } = useTrade()
  const user = useCurrentUser()
  const toast = useToast()
  const [kind, setKind] = useState<(typeof KINDS)[number]>(orders[0]?.kind === 'medication' ? 'Medication' : 'Feed')
  const forKind = orders.filter((o) => o.kind === (kind.toLowerCase() as StockKind))
  const [ref, setRef] = useState(forKind[0]?.ref ?? '')
  const order = forKind.find((o) => o.ref === ref) ?? forKind[0]
  const [delivered, setDelivered] = useState(order ? String(order.qty) : '')
  const [note, setNote] = useState('')
  const [sentBack, setSentBack] = useState('0')
  const [submitted, setSubmitted] = useState(false)

  const pick = (r: string) => {
    setRef(r)
    const o = orders.find((x) => x.ref === r)
    if (o) setDelivered(String(o.qty))
  }

  const feed = order && feedTypes.find((f) => f.name === order.item)
  const med = order && medications.find((m) => m.name === order.item)
  const base = feed?.bags ?? med?.stock ?? 0
  const inStore = order ? stockOf(order.item, base) : 0
  const intoStore = Math.max(num(delivered) - num(sentBack), 0) * (order?.perUnit ?? 1)
  const unitWord = order?.unit.startsWith('×') ? 'packs' : order?.unit ?? ''
  const errors = {
    delivered: num(delivered) > 0 ? undefined : 'Enter what arrived',
    sentBack: num(sentBack) > num(delivered) ? 'More than was delivered' : undefined,
    note: note.trim() ? undefined : 'Copy the number from the delivery note',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!order || errors.delivered || errors.sentBack || errors.note) return
    if (!(await receiveDelivery(order.ref, num(delivered), num(sentBack), note.trim(), user.name.split(' ')[0]))) return
    toast(`${order.ref} received · ${formatNumber(intoStore)} ${order.stockUnit} into the store`)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Receive a delivery"
      subtitle={`${weekdayDm(todayISO())}/${todayISO().slice(0, 4)}, ${nowHM()} · ${user.name}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="receive" disabled={!order}>
            Save delivery
          </Button>
        </>
      }
    >
      <form id="receive" onSubmit={submit} className="flex flex-col gap-5">
        <SegmentedControl fullWidth label="Delivery type" options={KINDS} value={kind} onChange={(k) => { setKind(k); const first = orders.find((o) => o.kind === k.toLowerCase()); if (first) pick(first.ref) }} />
        {!order ? (
          <p className="type-body-md text-fg-secondary">No {kind.toLowerCase()} orders are waiting. Ask Emeka to reorder if stock is low.</p>
        ) : (
          <>
            <Field label="Order" hint={`Ordered by ${order.orderedBy} on ${order.ordered} · ${order.qty} ${order.unit} ${order.item}`}>
              {(id) => (
                <SelectInput
                  id={id}
                  leadingIcon={Truck}
                  value={order.ref}
                  onChange={(e) => pick(e.target.value)}
                  options={forKind.map((o) => ({ value: o.ref, label: `${o.ref} · ${suppliers.find((s) => s.id === o.supplierId)?.name}` }))}
                />
              )}
            </Field>
            <Field label={kind === 'Feed' ? 'Feed type' : 'Medication'} hint={feed ? `${inStore} bags in store · ${feed.daysOfCover ?? '—'} days of cover` : `${formatNumber(inStore)} ${order.stockUnit} in store`}>
              {(id) => <SelectInput id={id} leadingIcon={Package} value={order.item} disabled options={[{ value: order.item, label: order.item }]} />}
            </Field>
            <div className="flex gap-3">
              <Field label={`${unitWord[0].toUpperCase()}${unitWord.slice(1)} delivered`} hint="As written on the delivery note" className="flex-1" error={submitted ? errors.delivered : undefined}>
                {(id) => <TextInput id={id} inputMode="numeric" suffix={unitWord} value={delivered} onChange={(e) => setDelivered(e.target.value)} />}
              </Field>
              <Field label="Delivery note" hint="Printed at the top of the note" className="flex-1" error={submitted ? errors.note : undefined}>
                {(id) => <TextInput id={id} placeholder="GF-DN-5521" value={note} onChange={(e) => setNote(e.target.value)} />}
              </Field>
            </div>
            <Field label="Into the store" auto hint={`${num(delivered)} delivered − ${num(sentBack)} sent back`}>
              {(id) => <AutoInput id={id} value={`${formatNumber(intoStore)} ${order.stockUnit}`} />}
            </Field>
            <Field label="Sent back damaged" hint="Torn, wet or caked — the driver takes them back" error={submitted ? errors.sentBack : undefined}>
              {(id) => <TextInput id={id} inputMode="numeric" suffix={unitWord} value={sentBack} onChange={(e) => setSentBack(e.target.value)} />}
            </Field>
            <SummaryBox>
              <KeyValueRow label={`${order.item} in store now`} calculated={explainMoney.inStoreNow()}>
                {formatNumber(inStore)} {order.stockUnit}
              </KeyValueRow>
              <KeyValueRow label="+ Into the store">
                {formatNumber(intoStore)} {order.stockUnit}
              </KeyValueRow>
              <KeyValueRow label="− Sent back">
                {num(sentBack)} {unitWord}
              </KeyValueRow>
              <KeyValueRow label={`${order.item} after saving`} strong calculated={explainMoney.afterReceiving()}>
                {formatNumber(inStore + intoStore)} {order.stockUnit}
              </KeyValueRow>
            </SummaryBox>
          </>
        )}
      </form>
    </Drawer>
  )
}
