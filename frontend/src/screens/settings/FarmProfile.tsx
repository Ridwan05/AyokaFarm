'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { AutoInput, Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Switch } from '../../components/ui/Switch'
import { dayMonth, liveBirdsByPen } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canEditSettings } from '../../lib/access'
import { formatNumber } from '../../lib/format'
import { createClient } from '../../lib/supabase/client'
import { SettingsHeader } from './SettingsHeader'

/** Settings inputs are 40px like the other dense settings forms. */
const Input = (props: Parameters<typeof TextInput>[0]) => <TextInput size="md" {...props} />

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// The app counts in naira on Lagos time; other choices would need the reports to change too.
const CURRENCIES = [{ value: 'NGN', label: 'Naira (₦)' }]
const TIME_ZONES = [{ value: 'Africa/Lagos', label: 'West Africa Time (WAT) · Africa/Lagos' }]

/** Highest number in refs like "S-1042", plus one. */
const nextNumber = (refs: string[]) => refs.reduce((n, r) => Math.max(n, Number(r.replace(/^\D+-?/, '')) || 0), 0) + 1

export default function FarmProfile() {
  const router = useRouter()
  const user = useCurrentUser()
  const { settings, catalog, history, sales, payments, reload } = useTrade()
  const editable = canEditSettings(user)
  const [form, setForm] = useState(() => ({
    farm_name: settings?.farm_name ?? '',
    trading_as: settings?.trading_as ?? '',
    address: settings?.address ?? '',
    phone: settings?.phone ?? '',
    email: settings?.email ?? '',
    currency: settings?.currency ?? 'NGN',
    financial_year_start_month: settings?.financial_year_start_month ?? 1,
    time_zone: settings?.time_zone ?? 'Africa/Lagos',
    receipt_footer: settings?.receipt_footer ?? '',
    whatsapp_sender: settings?.whatsapp_sender ?? '',
    whatsapp_monthly_limit: settings?.whatsapp_monthly_limit === null || settings?.whatsapp_monthly_limit === undefined ? '' : String(settings.whatsapp_monthly_limit),
    spread_rearing_cost: settings?.spread_rearing_cost ?? false,
    layer_laying_weeks: String(settings?.layer_laying_weeks ?? 60),
  }))
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const birds = [...liveBirdsByPen(history).values()].reduce((n, b) => n + b, 0)
  const activeStaff = catalog.profiles.filter((p) => p.is_active && p.role_id).length
  const goLive = settings?.go_live_date ? `${dayMonth(settings.go_live_date)} ${settings.go_live_date.slice(0, 4)}` : 'Not set'
  const fyEnd = MONTHS[(Number(form.financial_year_start_month) + 10) % 12]

  async function save() {
    if (!form.farm_name.trim()) return toast.error('Enter the farm’s name')
    const limit = form.whatsapp_monthly_limit.trim()
    if (limit && !(Number(limit) >= 0)) return toast.error('The WhatsApp limit must be a number')
    const weeks = Math.round(Number(form.layer_laying_weeks))
    if (!(weeks > 0)) return toast.error('The laying period must be at least 1 week')
    setSaving(true)
    const blank = (v: string) => v.trim() || null
    const { error } = await createClient()
      .from('farm_settings')
      .update({
        farm_name: form.farm_name.trim(),
        trading_as: blank(form.trading_as),
        address: blank(form.address),
        phone: blank(form.phone),
        email: blank(form.email),
        currency: form.currency,
        financial_year_start_month: Number(form.financial_year_start_month),
        time_zone: form.time_zone,
        receipt_footer: blank(form.receipt_footer),
        whatsapp_sender: blank(form.whatsapp_sender),
        whatsapp_monthly_limit: limit ? Math.round(Number(limit)) : null,
        spread_rearing_cost: form.spread_rearing_cost,
        layer_laying_weeks: weeks,
      })
      .eq('id', true)
    setSaving(false)
    if (error) return toast.error(/row-level security|permission/i.test(error.message) ? 'Only the owner can change the farm profile.' : error.message)
    toast.success('Farm profile saved')
    await reload()
  }

  return (
    <>
      <SettingsHeader
        title="Farm profile"
        description="Who the farm is on every receipt and statement, and the basics every number depends on."
        actions={
          editable && (
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )
        }
      />
      <fieldset disabled={!editable || saving} className="contents">
        <div className="flex flex-col gap-4 lg:flex-row">
          <Card className="min-w-0 flex-1 gap-4 p-5">
            <SectionTitle title="Farm" note="Shown on every receipt and statement" />
            <div className="flex flex-col gap-4 sm:flex-row">
              <Field label="Farm name" className="flex-1">{(id) => <Input id={id} value={form.farm_name} onChange={set('farm_name')} />}</Field>
              <Field label="Trading as" className="flex-1">{(id) => <Input id={id} value={form.trading_as} onChange={set('trading_as')} />}</Field>
            </div>
            <Field label="Address">{(id) => <Input id={id} value={form.address} onChange={set('address')} />}</Field>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Field label="Phone" className="flex-1">{(id) => <Input id={id} type="tel" value={form.phone} onChange={set('phone')} />}</Field>
              <Field label="Email" className="flex-1">{(id) => <Input id={id} type="email" value={form.email} onChange={set('email')} />}</Field>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Field label="Pens" auto hint="From Pens & flocks" className="flex-1">{(id) => <AutoInput id={id} value={`${catalog.pens.length} pens · ${formatNumber(birds)} birds`} />}</Field>
              <Field label="Staff" auto hint="From Staff" className="flex-1">{(id) => <AutoInput id={id} value={`${activeStaff} ${activeStaff === 1 ? 'person' : 'people'}`} />}</Field>
            </div>
          </Card>
          <Card className="w-full shrink-0 lg:w-[380px] gap-4 p-5">
            <SectionTitle title="Business" note="Every report uses these" />
            <Field label="Currency">{(id) => <SelectInput id={id} size="md" value={form.currency} onChange={set('currency')} options={CURRENCIES} />}</Field>
            <Field label="Financial year starts" hint={`Runs to the end of ${fyEnd}`}>
              {(id) => <SelectInput id={id} size="md" value={String(form.financial_year_start_month)} onChange={set('financial_year_start_month')} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />}
            </Field>
            <Field label="Time zone">{(id) => <SelectInput id={id} size="md" value={form.time_zone} onChange={set('time_zone')} options={TIME_ZONES} />}</Field>
            <Field label="Go-live date" auto hint="Opening balances start here">{(id) => <AutoInput id={id} value={goLive} />}</Field>
          </Card>
        </div>
        <Card className="gap-4 p-5">
          <SectionTitle title="Accounts" note="How the profit & loss treats the cost of raising layers" />
          <Switch
            label="Spread layer rearing cost over the laying period"
            checked={form.spread_rearing_cost}
            onChange={(on) => editable && !saving && setForm((f) => ({ ...f, spread_rearing_cost: on }))}
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Field
              label="Laying period"
              hint={`Each layer flock’s rearing cost (placement to start of lay) is charged evenly over this many weeks from its start of lay, about ${formatNumber(Math.round((Number(form.layer_laying_weeks) || 0) * 7 / 30.4))} months.`}
              className="sm:w-[260px]"
            >
              {(id) => <Input id={id} inputMode="numeric" value={form.layer_laying_weeks} onChange={set('layer_laying_weeks')} suffix="weeks" />}
            </Field>
            <p className="flex-1 type-body-sm text-fg-secondary sm:pt-7">
              {form.spread_rearing_cost
                ? 'The profit & loss opens in the spread view. The cash view (costs in the month they were spent) is still one tap away.'
                : 'The profit & loss opens in the cash view (costs in the month they were spent). The spread view is still there for comparison.'}
            </p>
          </div>
        </Card>
        <Card className="gap-4 p-5">
          <SectionTitle title="Receipts & messages" note="WhatsApp goes only to people who agreed (G25)" />
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Receipt footer" className="flex-1">{(id) => <Input id={id} value={form.receipt_footer} onChange={set('receipt_footer')} />}</Field>
            <Field label="WhatsApp sender" hint="Used once WhatsApp is connected" className="flex-1">{(id) => <Input id={id} value={form.whatsapp_sender} onChange={set('whatsapp_sender')} />}</Field>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Monthly WhatsApp limit" hint="Messages used: — (not connected yet)" className="flex-1">
              {(id) => <Input id={id} inputMode="numeric" value={form.whatsapp_monthly_limit} onChange={set('whatsapp_monthly_limit')} suffix="messages" placeholder="No limit" />}
            </Field>
            <Field label="Numbering" auto hint="Next numbers are given automatically" className="flex-1">
              {(id) => (
                <AutoInput
                  id={id}
                  value={`S-${String(nextNumber(sales.map((s) => s.receipt))).padStart(4, '0')} sales · P-${String(nextNumber(payments.filter((p) => !p.ref.startsWith('PP-')).map((p) => p.ref))).padStart(4, '0')} payments · PF/PM/PB purchases`}
                />
              )}
            </Field>
          </div>
          <div className="flex flex-col items-start gap-2 pt-1 sm:flex-row sm:items-center">
            <span className="flex-1 type-body-sm text-fg-secondary">
              {settings?.go_live_date ? `Opening balances, stock and flocks start on ${goLive} in the go-live setup.` : 'Set up opening balances and stock in the go-live setup.'}
            </span>
            <Button onClick={() => router.push('/go-live')}>View go-live setup</Button>
          </div>
        </Card>
      </fieldset>
    </>
  )
}

export function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <h2 className="type-h3 text-fg-primary">{title}</h2>
      {note && <span className="type-body-sm text-fg-tertiary">{note}</span>}
    </div>
  )
}
