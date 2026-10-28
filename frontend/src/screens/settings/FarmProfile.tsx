'use client'

import { useRouter } from 'next/navigation'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { AutoInput, Field, TextInput } from '../../components/ui/Form'
import { useToast } from '../../components/ui/toastContext'
import { pens } from '../../data/pens'
import { farmProfile as f, staff } from '../../data/settings'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'
import { SettingsHeader } from './SettingsHeader'

/** Settings inputs are 40px like the other dense settings forms. */
const Input = (props: Parameters<typeof TextInput>[0]) => <TextInput size="md" {...props} />

export default function FarmProfile() {
  const toast = useToast()
  const router = useRouter()
  const { sales, payments } = useTrade()
  const birds = pens.reduce((n, p) => n + p.liveBirds, 0)
  const nextSale = Math.max(...sales.map((s) => Number(s.receipt.slice(2)))) + 1
  const nextPayment = Math.max(...payments.filter((p) => !p.ref.startsWith('PP-')).map((p) => Number(p.ref.slice(2)))) + 1

  return (
    <>
      <SettingsHeader
        title="Farm profile"
        description="Who the farm is on every receipt and statement, and the basics every number depends on."
        actions={
          <Button variant="primary" onClick={() => toast('Farm profile saved')}>
            Save changes
          </Button>
        }
      />
      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="min-w-0 flex-1 gap-4 p-5">
          <SectionTitle title="Farm" note="Shown on every receipt and statement" />
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Farm name" className="flex-1">{(id) => <Input id={id} defaultValue={f.name} />}</Field>
            <Field label="Trading as" className="flex-1">{(id) => <Input id={id} defaultValue={f.tradingAs} />}</Field>
          </div>
          <Field label="Address">{(id) => <Input id={id} defaultValue={f.address} />}</Field>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Phone" className="flex-1">{(id) => <Input id={id} defaultValue={f.phone} />}</Field>
            <Field label="Email" className="flex-1">{(id) => <Input id={id} type="email" defaultValue={f.email} />}</Field>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Pens" auto hint="From Pens & flocks" className="flex-1">{(id) => <AutoInput id={id} value={`${pens.length} pens · ${formatNumber(birds)} birds`} />}</Field>
            <Field label="Staff" auto hint="From Staff" className="flex-1">{(id) => <AutoInput id={id} value={`${staff.filter((s) => s.active).length} people`} />}</Field>
          </div>
        </Card>
        <Card className="w-full shrink-0 lg:w-[380px] gap-4 p-5">
          <SectionTitle title="Business" note="Every report uses these" />
          <Field label="Currency">{(id) => <Input id={id} defaultValue={f.currency} />}</Field>
          <Field label="Financial year">{(id) => <Input id={id} defaultValue={f.financialYear} />}</Field>
          <Field label="Time zone">{(id) => <Input id={id} defaultValue={f.timezone} />}</Field>
          <Field label="Go-live date" auto hint="Opening balances start here">{(id) => <AutoInput id={id} value={f.goLive} />}</Field>
        </Card>
      </div>
      <Card className="gap-4 p-5">
        <SectionTitle title="Receipts & messages" note="WhatsApp goes only to people who agreed (G25)" />
        <div className="flex flex-col gap-4 sm:flex-row">
          <Field label="Receipt footer" className="flex-1">{(id) => <Input id={id} defaultValue={f.receiptFooter} />}</Field>
          <Field label="WhatsApp sender" className="flex-1">{(id) => <Input id={id} defaultValue={f.whatsappSender} />}</Field>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Field label="Monthly WhatsApp limit" auto hint="Statements stop at the limit; receipts still print" className="flex-1">
            {(id) => <AutoInput id={id} value={`${f.whatsappLimit} messages · ${f.whatsappUsed} used in October`} />}
          </Field>
          <Field label="Numbering" auto hint="Next numbers are given automatically" className="flex-1">
            {(id) => <AutoInput id={id} value={`S-${nextSale} sales · P-${String(nextPayment).padStart(4, '0')} payments · PF/PM/PB purchases`} />}
          </Field>
        </div>
        <div className="flex items-center pt-1">
          <span className="flex-1 type-body-sm text-fg-secondary">Opening balances, stock and flocks were entered on {f.goLive} in the go-live setup.</span>
          <Button onClick={() => router.push('/go-live')}>View go-live setup</Button>
        </div>
      </Card>
    </>
  )
}

export function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="type-h3 text-fg-primary">{title}</h2>
      {note && <span className="type-body-sm text-fg-tertiary">{note}</span>}
    </div>
  )
}
