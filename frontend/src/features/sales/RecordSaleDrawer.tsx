import { Package, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { AutoInput, Field, SelectInput, SummaryBox, TextInput } from '../../components/ui/Form'
import { explainMoney } from '../../data/explainMoney'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/toastContext'
import { ONE_OFF } from '../../data/customers'
import { daysBetween } from '../../data/ledger'
import { dm, nowHM, todayISO, weekdayDayMonth } from '../../data/metrics'
import { approvers } from '../../data/moneyKpis'
import { products, type PaymentMethod, type ProductKind } from '../../data/sales'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { PenPortions } from './PenPortions'
import { parsePortions, penChoices, portionError, type PortionRow } from './portionRules'

const KINDS = ['Eggs', 'Birds', 'Droppings'] as const
const METHODS = ['Cash', 'Transfer', 'POS'] as const
const num = (v: string) => Number(v.replace(/,/g, '')) || 0

export function RecordSaleDrawer({ onClose }: { onClose: () => void }) {
  const currentUser = useCurrentUser()
  const trade = useTrade()
  const { customers, sales, addSale, customerBalance, customerOpenBills } = trade
  const who = approvers(trade)
  const toast = useToast()
  const [kind, setKind] = useState<ProductKind>('Eggs')
  const kindProducts = products.filter((p) => p.kind === kind)
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? ONE_OFF.id)
  const [productId, setProductId] = useState(kindProducts[0].id)
  const product = products.find((p) => p.id === productId) ?? kindProducts[0]
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState(formatNumber(product.price))
  const [paid, setPaid] = useState('')
  // Start from how this person took money last time, not a sample value.
  const lastMethod = sales.find((s) => s.recordedBy === currentUser.name.split(' ')[0] && s.method)?.method
  const [method, setMethod] = useState<(typeof METHODS)[number]>(lastMethod === 'cash' ? 'Cash' : lastMethod === 'transfer' ? 'Transfer' : 'POS')
  const [submitted, setSubmitted] = useState(false)
  // Pens the sale came from. Birds must say; eggs and droppings can be left to the auto-split.
  const [split, setSplit] = useState(false)
  const [portions, setPortions] = useState<PortionRow[]>([])

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
  const choices = penChoices(trade, product.id)
  const needsPens = kind === 'Birds'
  const usePens = needsPens || split
  const portionProblem = usePens ? portionError(portions, choices, num(qty), product.unit) : ''

  /** Start the pen rows again for a new product: birds get one row with the whole quantity. */
  const resetPortions = (productId: string, k: ProductKind) => {
    const first = penChoices(trade, productId)[0]
    setPortions(k === 'Birds' && first ? [{ penId: first.penId, qty }] : [])
    setSplit(false)
  }
  const changeQty = (v: string) => {
    setQty(v)
    // With one pen, it takes the whole sale.
    if (portions.length === 1) setPortions([{ ...portions[0], qty: v }])
  }

  const changeKind = (k: ProductKind) => {
    setKind(k)
    const first = products.find((p) => p.kind === k)!
    setProductId(first.id)
    setPrice(formatNumber(first.price))
    resetPortions(first.id, k)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.qty || errors.price || errors.paid || portionProblem) return
    const next = Math.max(...sales.map((s) => Number(s.receipt.slice(2)))) + 1
    const receipt = `S-${next}`
    const m: PaymentMethod = method === 'POS' ? 'POS' : method === 'Cash' ? 'cash' : 'transfer'
    if (!(await addSale({
      receipt,
      date: `${dm(todayISO())} ${nowHM()}`,
      iso: todayISO(),
      customerId: customer?.id ?? ONE_OFF.id,
      productId: product.id,
      qty: num(qty),
      price: num(price),
      // Money taken at the gate is kept even if the price needs approval; the receipt waits for it.
      paid: paidNow,
      method: paidNow ? m : undefined,
      recordedBy: currentUser.name.split(' ')[0],
      pendingApproval: belowMin,
      allocations: usePens ? parsePortions(portions) : [],
      history: [{ title: belowMin ? 'Sent for approval' : 'Sale recorded', detail: `By ${currentUser.name.split(' ')[0]}`, time: nowHM() }],
    }))) return
    toast(belowMin ? 'Sale sent for approval' : 'Sale recorded')
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Record a sale"
      subtitle={`${weekdayDayMonth(todayISO())}, ${nowHM()} · recorded by ${currentUser.name.split(' ')[0]}`}
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
        <Field label="Product" hint={kind === 'Eggs' ? 'From the egg store · crates on withdrawal are left out' : kind === 'Birds' ? 'Say which pens below' : undefined}>
          {(id) => (
            <SelectInput
              id={id}
              leadingIcon={Package}
              value={product.id}
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value)!
                setProductId(p.id)
                setPrice(formatNumber(p.price))
                resetPortions(p.id, kind)
              }}
              options={kindProducts.map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label={product.unit[0].toUpperCase() + product.unit.slice(1)} className="flex-1" hint={kind === 'Eggs' ? 'Whole crates of 30 eggs' : undefined} error={submitted ? errors.qty : undefined}>
            {(id) => <TextInput id={id} inputMode="numeric" suffix={product.unit} value={qty} onChange={(e) => changeQty(e.target.value)} />}
          </Field>
          <Field
            label={`Price per ${unit}`}
            className="flex-1"
            hint={`Minimum ₦${formatNumber(product.minPrice)} · lower needs ${who.split(' or ')[0]}`}
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
        <section aria-label="From pens" className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="flex-1 type-label-md text-fg-primary">From pens</span>
            {!needsPens && (
              <Switch
                label="Split across pens"
                checked={split}
                onChange={(on) => {
                  setSplit(on)
                  if (on && !portions.length && choices[0]) setPortions([{ penId: choices[0].penId, qty }])
                }}
              />
            )}
          </div>
          {usePens ? (
            <>
              <PenPortions choices={choices} rows={portions} onChange={setPortions} total={num(qty)} unit={product.unit} showErrors={submitted} />
              {submitted && portionProblem && <p className="type-body-sm text-fg-danger">{portionProblem}</p>}
            </>
          ) : (
            <p className="type-body-sm text-fg-tertiary">Auto-split: reports share this sale across pens by eggs collected.</p>
          )}
        </section>
        {belowMin && (
          <Alert tone="warning" title={`Below the ₦${formatNumber(product.minPrice)} minimum`}>
            This sale will wait for {who} to approve it. The receipt is held until then.
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
            <KeyValueRow label={`${customer.short} owes now`} calculated={explainMoney.balanceNow()}>
              ₦ {formatNumber(balance)}
            </KeyValueRow>
            <KeyValueRow label="+ This sale">₦ {formatNumber(total)}</KeyValueRow>
            <KeyValueRow label="− Paid now">₦ {formatNumber(paidNow)}</KeyValueRow>
            <KeyValueRow label="New balance" strong calculated={explainMoney.newBalanceSale()}>
              ₦ {formatNumber(balance + total - paidNow)}
            </KeyValueRow>
          </SummaryBox>
        )}
      </form>
    </Drawer>
  )
}
