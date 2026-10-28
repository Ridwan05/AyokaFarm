import { Package, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { AutoInput, Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useToast } from '../../components/ui/toastContext'
import { ONE_OFF } from '../../data/customers'
import { daysBetween } from '../../data/ledger'
import { products, type PaymentMethod, type ProductKind } from '../../data/sales'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

const KINDS = ['Eggs', 'Birds', 'Droppings'] as const
const METHODS = ['Cash', 'Transfer', 'POS'] as const
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

export function RecordSaleDrawer({ onClose }: { onClose: () => void }) {
  const currentUser = useCurrentUser()
  const { customers, sales, addSale, customerBalance, customerOpenBills } = useTrade()
  const toast = useToast()
  const [kind, setKind] = useState<ProductKind>('Eggs')
  const kindProducts = products.filter((p) => p.kind === kind)
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? ONE_OFF.id)
  const [productId, setProductId] = useState(kindProducts[0].id)
  const product = products.find((p) => p.id === productId) ?? kindProducts[0]
  const [qty, setQty] = useState('25')
  const [price, setPrice] = useState(formatNumber(product.price))
  const [paid, setPaid] = useState('50,000')
  const [method, setMethod] = useState<(typeof METHODS)[number]>('POS')
  const [submitted, setSubmitted] = useState(false)

  const customer = customers.find((c) => c.id === customerId)
  const balance = customer ? customerBalance(customer.id) : 0
  const oldest = customer ? customerOpenBills(customer.id)[0] : undefined
  const total = num(qty) * num(price)
  const paidNow = num(paid)
  const belowMin = num(price) > 0 && num(price) < product.minPrice
  const oneOffUnpaid = !customer && paidNow < total
  const errors = {
    qty: num(qty) > 0 ? undefined : 'Enter a quantity',
    price: num(price) > 0 ? undefined : 'Enter a price',
    paid: paidNow > total ? 'More than the total' : oneOffUnpaid ? 'One-off buyers pay in full' : undefined,
  }
  const unit = product.unit.replace(/s$/, '')

  const changeKind = (k: ProductKind) => {
    setKind(k)
    const first = products.find((p) => p.kind === k)!
    setProductId(first.id)
    setPrice(formatNumber(first.price))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.qty || errors.price || errors.paid) return
    const next = Math.max(...sales.map((s) => Number(s.receipt.slice(2)))) + 1
    const receipt = `S-${next}`
    const m: PaymentMethod = method === 'POS' ? 'POS' : method === 'Cash' ? 'cash' : 'transfer'
    if (!(await addSale({
      receipt,
      date: '09/10 15:40',
      customerId: customer?.id ?? ONE_OFF.id,
      productId: product.id,
      qty: num(qty),
      price: num(price),
      paid: belowMin ? 0 : paidNow,
      method: paidNow && !belowMin ? m : undefined,
      recordedBy: currentUser.name.split(' ')[0],
      pendingApproval: belowMin,
      history: [{ title: belowMin ? 'Sent for approval' : 'Sale recorded', detail: `By ${currentUser.name.split(' ')[0]}`, time: '15:40' }],
    }))) return
    toast(belowMin ? 'Sale sent for approval' : 'Sale recorded')
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Record a sale"
      subtitle={`Fri 09/10/2026, 15:40 · recorded by ${currentUser.name.split(' ')[0]}`}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="record-sale">
            {belowMin ? 'Send for approval' : 'Record sale'}
          </Button>
        </>
      }
    >
      <form id="record-sale" onSubmit={submit} className="flex flex-col gap-5">
        <SegmentedControl fullWidth label="Product type" options={KINDS} value={kind} onChange={changeKind} />
        <Field
          label="Customer"
          hint={
            customer
              ? `Owes ₦${formatNumber(balance)}${oldest ? ` · oldest bill ${daysBetween(oldest.date)} days` : ''} · WhatsApp ${customer.whatsapp ? 'opted in' : 'not set up'}`
              : 'Walk-in buyer · pays in full'
          }
        >
          {(id) => (
            <SelectInput
              id={id}
              leadingIcon={Users}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              options={[...customers.map((c) => ({ value: c.id, label: c.name })), { value: ONE_OFF.id, label: ONE_OFF.name }]}
            />
          )}
        </Field>
        <Field label="Product" hint={kind === 'Eggs' ? 'From the egg store · crates on withdrawal are left out' : `From ${product.from}`}>
          {(id) => (
            <SelectInput
              id={id}
              leadingIcon={Package}
              value={product.id}
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value)!
                setProductId(p.id)
                setPrice(formatNumber(p.price))
              }}
              options={kindProducts.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label={product.unit[0].toUpperCase() + product.unit.slice(1)} className="flex-1" hint={kind === 'Eggs' ? 'Whole crates of 30 eggs' : undefined} error={submitted ? errors.qty : undefined}>
            {(id) => <TextInput id={id} inputMode="numeric" suffix={product.unit} value={qty} onChange={(e) => setQty(e.target.value)} />}
          </Field>
          <Field
            label={`Price per ${unit}`}
            className="flex-1"
            hint={`Minimum ₦${formatNumber(product.minPrice)} · lower needs Emeka`}
            error={submitted ? errors.price : undefined}
          >
            {(id) => (
              <TextInput
                id={id}
                prefix="₦"
                inputMode="numeric"
                value={price}
                invalid={belowMin}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={() => num(price) && setPrice(formatNumber(num(price)))}
              />
            )}
          </Field>
        </div>
        {belowMin && (
          <Alert tone="warning" title={`Below the ₦${formatNumber(product.minPrice)} minimum`}>
            This sale will wait for Emeka or Adeola to approve it. The receipt is held until then.
          </Alert>
        )}
        <Field label="Total" auto hint={`${formatNumber(num(qty))} ${product.unit} × ₦${formatNumber(num(price))}`}>
          {(id) => <AutoInput id={id} prefix="₦" value={formatNumber(total)} />}
        </Field>
        <Field
          label="Amount paid now"
          hint={`By ${method}${customer ? ' · leave 0 if it’s all on credit' : ''}`}
          error={submitted ? errors.paid : undefined}
        >
          {(id) => (
            <TextInput
              id={id}
              prefix="₦"
              inputMode="numeric"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              onBlur={() => setPaid(formatNumber(num(paid)))}
            />
          )}
        </Field>
        <SegmentedControl fullWidth label="Payment method" options={METHODS} value={method} onChange={setMethod} />
        {customer && (
          <SummaryBox>
            <KeyValueRow label={`${customer.short} owes now`} calculated>
              ₦ {formatNumber(balance)}
            </KeyValueRow>
            <KeyValueRow label="+ This sale">₦ {formatNumber(total)}</KeyValueRow>
            <KeyValueRow label="− Paid now">₦ {formatNumber(paidNow)}</KeyValueRow>
            <KeyValueRow label="New balance" strong calculated>
              ₦ {formatNumber(balance + total - paidNow)}
            </KeyValueRow>
          </SummaryBox>
        )}
      </form>
    </Drawer>
  )
}
