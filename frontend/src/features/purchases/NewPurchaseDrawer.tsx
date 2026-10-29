import { Package, Truck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { AutoInput, Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { explainMoney } from '../../data/explainMoney'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { feedTypes, medications } from '../../data/inventory'
import { TODAY_ISO } from '../../data/ledger'
import { weekdayDayMonth } from '../../data/metrics'
import { refPrefix, totalOf, type PurchaseKind } from '../../data/purchases'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { dayMonth } from './purchaseView'

const KINDS = ['Feed', 'Birds', 'Medication'] as const
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

type Item = { name: string; unit: string; per: string; unitLabel: string; hint: string; defaultPrice: number }

/** Built when the drawer opens: feed types and medications are loaded from Supabase after this module is imported. */
const buildItems = (): Record<PurchaseKind, Item[]> => ({
  Feed: feedTypes.map((f) => ({
    name: f.name,
    unit: 'bags',
    per: 'a bag',
    unitLabel: 'Bags',
    hint: `${f.bags} bags in store · ${f.daysOfCover === null ? 'not in use' : `${f.daysOfCover} days of cover`}`,
    defaultPrice: 18500,
  })),
  Birds: [
    { name: 'Day-old broilers', unit: 'birds', per: 'a bird', unitLabel: 'Birds', hint: 'For the next broiler flock', defaultPrice: 850 },
    { name: 'Day-old layers', unit: 'birds', per: 'a bird', unitLabel: 'Birds', hint: 'For the next layer flock', defaultPrice: 900 },
    { name: 'Point-of-lay pullets', unit: 'birds', per: 'a bird', unitLabel: 'Birds', hint: '16–18 weeks old', defaultPrice: 3500 },
  ],
  Medication: medications.map((m) => ({
    name: m.name,
    unit: 'packs',
    per: 'a pack',
    unitLabel: 'Packs',
    hint: `${formatNumber(m.stock)} ${m.unit} in stock · reorder at ${formatNumber(m.reorderAt)} ${m.unit}`,
    defaultPrice: 8500,
  })),
})

export function NewPurchaseDrawer({ onClose }: { onClose: () => void }) {
  const currentUser = useCurrentUser()
  const { suppliers, purchases, supplierBalance, addPurchase } = useTrade()
  const toast = useToast()
  const [items] = useState(buildItems)
  // The first supplier of each kind, e.g. a feed supplier for feed.
  const defaultSupplier = (k: PurchaseKind) => (suppliers.find((s) => s.kind === k) ?? suppliers[0])?.id ?? ''
  const [kind, setKind] = useState<PurchaseKind>('Feed')
  const [supplierId, setSupplierId] = useState(() => defaultSupplier('Feed'))
  const [itemName, setItemName] = useState(items.Feed[0].name)
  const item = items[kind].find((i) => i.name === itemName) ?? items[kind][0]
  const last = purchases.find((p) => p.item === item.name)
  const [qty, setQty] = useState('100')
  const [price, setPrice] = useState(formatNumber(last?.price ?? item.defaultPrice))
  const [paid, setPaid] = useState('1,500,000')
  const [submitted, setSubmitted] = useState(false)

  const supplier = suppliers.find((s) => s.id === supplierId)!
  const owed = supplierBalance(supplier.id)
  const lastFromSupplier = purchases.find((p) => p.supplierId === supplier.id)
  const total = num(qty) * num(price)
  const paidNow = num(paid)
  const errors = {
    qty: num(qty) > 0 ? undefined : 'Enter a quantity',
    price: num(price) > 0 ? undefined : 'Enter a price',
    paid: paidNow > total ? 'More than the total' : undefined,
  }

  const changeKind = (k: PurchaseKind) => {
    setKind(k)
    setSupplierId(defaultSupplier(k))
    const first = items[k][0]
    setItemName(first.name)
    setPrice(formatNumber(purchases.find((p) => p.item === first.name)?.price ?? first.defaultPrice))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.qty || errors.price || errors.paid) return
    const prefix = refPrefix[kind]
    const next = Math.max(...purchases.filter((p) => p.ref.startsWith(prefix)).map((p) => Number(p.ref.slice(3)))) + 1
    const ref = `${prefix}-${String(next).padStart(4, '0')}`
    const me = currentUser.name.split(' ')[0]
    const purchase = {
      ref, date: TODAY_ISO, supplierId, kind, item: item.name, qty: num(qty), unit: item.unit, per: item.per, price: num(price), paidAtPurchase: paidNow, recordedBy: me,
      history: [{ title: 'Purchase recorded', detail: `By ${me}${paidNow ? ` · paid ₦${formatNumber(paidNow)}` : ''}`, time: dayMonth(TODAY_ISO) }],
    }
    if (!(await addPurchase(purchase))) return
    toast(`Purchase saved · ₦${formatNumber(totalOf(purchase))}`)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="New purchase"
      subtitle={`${weekdayDayMonth(TODAY_ISO)} · recorded by ${currentUser.name.split(' ')[0]}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="new-purchase">
            Save purchase
          </Button>
        </>
      }
    >
      <form id="new-purchase" onSubmit={submit} className="flex flex-col gap-5">
        <SegmentedControl fullWidth label="Purchase type" options={KINDS} value={kind} onChange={changeKind} />
        <Field
          label="Supplier"
          hint={`${owed > 0 ? `You owe ₦${formatNumber(owed)}` : owed < 0 ? `They hold ₦${formatNumber(-owed)} credit` : 'Nothing owed'}${lastFromSupplier ? ` · last delivery ${dayMonth(lastFromSupplier.date)}` : ''}`}
        >
          {(id) => (
            <SelectInput
              id={id}
              leadingIcon={Truck}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              options={suppliers.filter((s) => s.kind === kind).map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
        </Field>
        <Field label={kind === 'Feed' ? 'Feed type' : kind === 'Birds' ? 'Birds' : 'Medication'} hint={item.hint}>
          {(id) => (
            <SelectInput
              id={id}
              leadingIcon={Package}
              value={item.name}
              onChange={(e) => {
                setItemName(e.target.value)
                const it = items[kind].find((i) => i.name === e.target.value)!
                setPrice(formatNumber(purchases.find((p) => p.item === it.name)?.price ?? it.defaultPrice))
              }}
              options={items[kind].map((i) => ({ value: i.name, label: i.name }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label={item.unitLabel} className="flex-1" hint={kind === 'Feed' ? '25 kg bags' : undefined} error={submitted ? errors.qty : undefined}>
            {(id) => <TextInput id={id} inputMode="numeric" suffix={item.unit} value={qty} onChange={(e) => setQty(e.target.value)} />}
          </Field>
          <Field
            label={`Price per ${item.unit.replace(/s$/, '')}`}
            className="flex-1"
            hint={last ? `Last: ₦${formatNumber(last.price)} on ${dayMonth(last.date)}` : undefined}
            error={submitted ? errors.price : undefined}
          >
            {(id) => (
              <TextInput id={id} prefix="₦" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => setPrice(formatNumber(num(price)))} />
            )}
          </Field>
        </div>
        <Field label="Total cost" auto hint={`${formatNumber(num(qty))} ${item.unit} × ₦${formatNumber(num(price))}`}>
          {(id) => <AutoInput id={id} prefix="₦" value={formatNumber(total)} />}
        </Field>
        <Field label="Amount paid now" hint="Leave 0 if you’ll pay later" error={submitted ? errors.paid : undefined}>
          {(id) => (
            <TextInput id={id} prefix="₦" inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} onBlur={() => setPaid(formatNumber(paidNow))} />
          )}
        </Field>
        <SummaryBox>
          <KeyValueRow label={`Owed to ${supplier.short} now`} calculated={explainMoney.balanceNow()}>
            ₦ {formatNumber(owed)}
          </KeyValueRow>
          <KeyValueRow label="+ This purchase">₦ {formatNumber(total)}</KeyValueRow>
          <KeyValueRow label="− Paid now">₦ {formatNumber(paidNow)}</KeyValueRow>
          <KeyValueRow label="New balance owed" strong calculated={explainMoney.newBalancePurchase()}>
            ₦ {formatNumber(owed + total - paidNow)}
          </KeyValueRow>
        </SummaryBox>
      </form>
    </Drawer>
  )
}
