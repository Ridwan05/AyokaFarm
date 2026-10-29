import { Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast as errorToast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/toastContext'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { createClient } from '../../lib/supabase/client'
import { friendlyError, REFUSED, SUPPLIER_KINDS, supplierKind, TERMS } from '../customers/partyRules'

const kindLabel = (k: string | undefined) => SUPPLIER_KINDS.find((x) => x.toLowerCase() === k) ?? 'Feed'

/** Edit a supplier's details. The opening balance is the owner's. */
export function EditSupplierModal({ supplierId, onClose }: { supplierId: string; onClose: () => void }) {
  const trade = useTrade()
  const user = useCurrentUser()
  const toast = useToast()
  const row = trade.catalog.suppliers.find((s) => String(s.id) === supplierId)
  const owner = user.role === 'owner'
  const [kind, setKind] = useState<(typeof SUPPLIER_KINDS)[number]>(kindLabel(row?.supplies[0]))
  const [name, setName] = useState(row?.name ?? '')
  const [short, setShort] = useState(row?.short_name ?? '')
  const [phone, setPhone] = useState(row?.phone ?? '')
  const [address, setAddress] = useState(row?.address ?? '')
  const [terms, setTerms] = useState(String(row?.payment_terms_days ?? 0))
  const [active, setActive] = useState(row?.is_active ?? true)
  const [opening, setOpening] = useState(formatNumber(Number(row?.opening_balance ?? 0)))
  const [source, setSource] = useState(row?.opening_balance_source ?? '')
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const openingValue = Number(opening.replace(/,/g, '')) || 0
  const errors = { name: name.trim() ? undefined : 'Enter the business name' }
  // Keep any other kinds the supplier already had; the first one is the main kind.
  const supplies = row ? [supplierKind(kind), ...row.supplies.filter((s) => s !== supplierKind(kind))] : [supplierKind(kind)]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!row || errors.name) return
    setSaving(true)
    const openingChanged = owner && openingValue !== Number(row.opening_balance)
    const { data, error } = await createClient()
      .from('suppliers')
      .update({
        name: name.trim(),
        short_name: short.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        supplies,
        payment_terms_days: Number(terms),
        is_active: active,
        ...(owner
          ? {
              opening_balance: openingValue,
              opening_balance_source: source.trim() || null,
              ...(openingChanged ? { opening_balance_checked: false } : {}),
            }
          : {}),
      })
      .eq('id', row.id)
      .select('id')
    setSaving(false)
    if (error) return void errorToast.error(friendlyError(error.message))
    if (!data?.length) return void errorToast.error(REFUSED)
    await trade.reload()
    toast(`${name.trim()} saved`)
    onClose()
  }

  const termOptions = TERMS.some((t) => t.value === terms) ? TERMS : [...TERMS, { value: terms, label: `${terms} days after delivery` }]

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit supplier"
      subtitle={row?.name ?? 'Supplier not found'}
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="edit-supplier" disabled={saving || !row}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-supplier" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="type-label-md text-fg-primary">Mainly supplies</span>
          <SegmentedControl fullWidth label="Supplies" options={SUPPLIER_KINDS} value={kind} onChange={setKind} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label="Business name" className="flex-1" error={submitted ? errors.name : undefined}>
            {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Short name" className="flex-1" hint="Used in tables">
            {(id) => <TextInput id={id} value={short} onChange={(e) => setShort(e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label="Phone" className="flex-1">
            {(id) => <TextInput id={id} type="tel" leadingIcon={Phone} value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Address or contact" className="flex-1">
            {(id) => <TextInput id={id} value={address} onChange={(e) => setAddress(e.target.value)} />}
          </Field>
        </div>
        <Field label="Payment terms">
          {(id) => <SelectInput id={id} value={terms} onChange={(e) => setTerms(e.target.value)} options={termOptions} />}
        </Field>
        <Switch label="Active (shows in the purchase form)" checked={active} onChange={setActive} />
        {owner ? (
          <>
            <Field label="Opening balance (we owed)" hint="What the farm owed them at go-live. Changing it marks it as not yet checked.">
              {(id) => (
                <TextInput id={id} prefix="₦" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} onBlur={() => setOpening(formatNumber(openingValue))} />
              )}
            </Field>
            <Field label="Where the opening balance came from">
              {(id) => <TextInput id={id} value={source} onChange={(e) => setSource(e.target.value)} />}
            </Field>
          </>
        ) : (
          <p className="type-body-sm text-fg-tertiary">Opening balance: ₦{formatNumber(Number(row?.opening_balance ?? 0))}. Only the owner can change it.</p>
        )}
      </form>
    </Modal>
  )
}
