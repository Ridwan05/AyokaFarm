'use client'

import { Plus, Scale } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useCurrentUser } from '../../data/sessionContext'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { InfoTip } from '../../components/ui/InfoTip'
import { explain } from '../../data/explain'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { KpiCard } from '../../components/ui/KpiCard'
import { Modal, Presence } from '../../components/ui/Overlay'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { farmSettings } from '../../data/farmSettings'
import { addDays, dayMonth, kpi, layingRate, lastDays, naira, num, period, previous, rowsOn, series, todayISO, weekdayDayMonth, weekdayDm } from '../../data/metrics'
import { crates, dailyLedger, heldEggs, salesOfItem } from '../../data/stockMetrics'
import { useTrade } from '../../data/tradeContext'
import { isAttendant } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { createClient } from '../../lib/supabase/client'
import { PendingCounts } from '../../features/stock/PendingCounts'
import { InventoryTabs } from './InventoryTabs'

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

type Row = ReturnType<typeof dailyLedger>[number] & { held: number | null }

const signed = (eggs: number, sign: '+' | '−') => (eggs ? <NumberCell>{`${sign}${num(crates(eggs), 1).replace(/\.0$/, '')}`}</NumberCell> : <NumberCell tone="muted">—</NumberCell>)
const cr = (eggs: number) => num(crates(eggs), 1).replace(/\.0$/, '')

export default function EggStore() {
  const [showHeld, setShowHeld] = useState(true)
  const [writingOff, setWritingOff] = useState(false)
  const router = useRouter()
  const role = useCurrentUser().role
  const { history, catalog, stockOf } = useTrade()
  const keeper = role === 'store-keeper'
  // Pen attendants can look, not act (BRD §4: Inventory V).
  const readOnly = isAttendant(role)
  const today = todayISO()

  const held = heldEggs(history, catalog, today)
  const heldTotal = held.reduce((n, h) => n + h.eggs, 0)
  const onHand = stockOf('eggs')
  const ledger = dailyLedger(history, (d) => d.item === 'eggs', addDays(today, -13), today)
  const rows: Row[] = ledger.map((r) => ({
    ...r,
    held: held.length ? held.reduce((n, h) => n + (r.date >= h.since ? history.daily.filter((d) => d.penId === h.penId && d.date >= h.since && d.date <= r.date).reduce((m, d) => m + (d.eggs ?? 0), 0) : 0), 0) : null,
  }))

  const days = lastDays(8)
  const closingOn = (date: string) => dailyLedger(history, (d) => d.item === 'eggs', date, date)[0]?.closing ?? 0
  const week = period('week', today)
  const lastWeek = previous(week)
  const soldWeek = salesOfItem(history, catalog, 'eggs', week)
  const soldLast = salesOfItem(history, catalog, 'eggs', lastWeek)
  const collected = (date: string) => rowsOn(history.daily, date).reduce((n, d) => n + (d.eggs ?? 0), 0)
  const layingToday = layingRate(rowsOn(history.daily, today))
  const kpis = [
    kpi({ label: 'Sellable now', value: cr(onHand - heldTotal), unit: 'crates', current: onHand - heldTotal, previous: closingOn(addDays(today, -1)), context: 'in store, less held crates', info: 'Eggs collected − sold − broken or counted out, in crates, less the crates held back for pens in withdrawal.', spark: series(days, closingOn).map(crates) }),
    kpi({ label: 'Held · withdrawal', value: cr(heldTotal), unit: 'crates', current: null, previous: null, goodWhen: 'neither', context: held.length ? held.map((h) => `Pen ${h.penId} to ${dayMonth(h.clearFrom)}`).join(' · ') : 'No pen in withdrawal', info: 'Eggs collected since the last dose in pens still in a medication withdrawal period, in crates. They can’t be sold until the pen is clear.', spark: FLAT }),
    kpi({ label: 'Collected today', value: cr(collected(today)), unit: 'crates', current: collected(today), previous: collected(addDays(today, -1)), context: layingToday !== null ? `${num(layingToday, 1)}% laying` : 'No entries yet today', info: 'Eggs collected in today’s daily entries ÷ eggs a crate, compared with yesterday.', spark: series(days, collected).map(crates) }),
    kpi({ label: 'Sold this week', value: num(soldWeek.qty), unit: 'crates', current: soldWeek.qty, previous: soldLast.qty, context: soldWeek.qty ? `avg ${naira(soldWeek.amount / soldWeek.qty)} a crate` : 'vs last week', info: 'Crates on approved egg sales since Monday, compared with the same days last week. Average price = money ÷ crates.', spark: series(days, (d) => salesOfItem(history, catalog, 'eggs', { from: d, to: d }).qty) }),
  ]

  const columns: Column<Row>[] = [
    { key: 'date', header: 'Date', width: 130, render: (r) => <TextCell>{weekdayDm(r.date)}</TextCell> },
    { key: 'opening', header: 'Opening', align: 'right', width: 110, render: (r) => <NumberCell>{cr(r.opening)}</NumberCell> },
    { key: 'collected', header: 'Collected', align: 'right', width: 110, render: (r) => signed(r.received, '+') },
    { key: 'sold', header: 'Sold', align: 'right', width: 110, render: (r) => signed(r.used, '−') },
    {
      key: 'adjusted',
      header: 'Broken / count',
      align: 'right',
      width: 130,
      render: (r) => (r.adjusted ? <NumberCell tone="warning">{`${r.adjusted > 0 ? '+' : '−'}${cr(Math.abs(r.adjusted))}`}</NumberCell> : <NumberCell tone="muted">—</NumberCell>),
    },
    ...(held.length
      ? [{ key: 'held', header: 'Held', align: 'right' as const, width: 100, render: (r: Row) => (r.held ? <NumberCell>{cr(r.held)}</NumberCell> : <NumberCell tone="muted">—</NumberCell>) }]
      : []),
    { key: 'closing', header: 'Closing', align: 'right', width: 120, render: (r) => <NumberCell tone="strong">{cr(r.closing)}</NumberCell> },
  ]

  const exportLedger = () =>
    downloadCsv(
      'egg-store',
      ['Date', 'Opening (crates)', 'Collected', 'Sold', 'Broken / count', 'Held', 'Closing'],
      rows.map((r) => [r.date, crates(r.opening), crates(r.received), crates(r.used), crates(r.adjusted), r.held === null ? '' : crates(r.held), crates(r.closing)]),
    )

  return (
    <>
      <PageHeader
        eyebrow={keeper ? ['Inventory', 'Eggs'] : ['Operate', 'Inventory']}
        title="Egg store"
        description={keeper ? 'Read only for the store — eggs come in from pen entries and go out through sales.' : 'Eggs come in from pen entries and go out through sales — counted, never typed.'}
        actions={
          readOnly ? undefined : keeper ? (
            <Button leadingIcon={Scale} onClick={() => router.push('/inventory/count')}>
              Stock count
            </Button>
          ) : (
            <>
              <Button leadingIcon={Scale} onClick={() => router.push('/inventory/count')}>
                Stock count
              </Button>
              <Button variant="primary" leadingIcon={Plus} onClick={() => setWritingOff(true)}>
                Write off eggs
              </Button>
            </>
          )
        }
      />
      <PendingCounts only="eggs" />

      <InventoryTabs />

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      {showHeld &&
        held.map((h) => (
          <Alert key={h.penId} title={`Pen ${h.penId}’s eggs are held until ${weekdayDayMonth(h.clearFrom)}`} onDismiss={() => setShowHeld(false)}>
            {h.medication} withdrawal ({h.days} days from the last dose on {dayMonth(h.lastDose)}). About {cr(h.eggs)} crates collected since {dayMonth(h.since)} are kept
            apart and can’t be sold; write them off with a reason when the withdrawal ends.{" "}
            <InfoTip label="Eggs held">{explain.eggsHeld()} Crates = eggs this pen collected since the dose ÷ {farmSettings.eggsPerCrate}.</InfoTip>
          </Alert>
        ))}

      <Card>
        <CardHeader
          title="Egg store ledger"
          meta={<span className="type-body-sm text-fg-tertiary">Crates of {farmSettings.eggsPerCrate} · last 14 days · closing = opening + collected − sold ± broken or counted</span>}
          action={{ label: 'Export', onClick: exportLedger }}
        />
        <Table columns={columns} rows={rows} rowKey={(r) => r.date} />
      </Card>

      <Presence>{writingOff && <WriteOffModal onClose={() => setWritingOff(false)} />}</Presence>
    </>
  )
}

/** Broken or unsellable eggs leave the store as a stock adjustment with the "Broken eggs" reason. */
function WriteOffModal({ onClose }: { onClose: () => void }) {
  const user = useCurrentUser()
  const { catalog, reload, stockOf } = useTrade()
  const [count, setCount] = useState('')
  const [unit, setUnit] = useState<'crates' | 'eggs'>('crates')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const reason = catalog.reasons.find((r) => r.name === 'Broken eggs' && r.is_active)
  const eggs = Math.round((Number(count) || 0) * (unit === 'crates' ? farmSettings.eggsPerCrate : 1))
  const tooMany = eggs > stockOf('eggs')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (eggs <= 0 || tooMany) return
    if (!reason) return void toast.error('Add a “Broken eggs” adjustment reason in Settings › Lists first')
    setBusy(true)
    const { error } = await createClient()
      .from('stock_adjustments')
      .insert({ item: 'eggs', quantity_change: -eggs, reason_id: reason.id, adjusted_on: todayISO(), note: note || null, recorded_by: user.id })
    setBusy(false)
    if (error) return void toast.error(/row-level security|permission/i.test(error.message) ? 'You don’t have permission to do that.' : error.message)
    await reload()
    toast.success(`${num(eggs)} eggs written off`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Write off eggs"
      subtitle="Broken or unsellable eggs leave the store with a reason"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="write-off" disabled={busy}>
            {busy ? 'Saving…' : 'Write off'}
          </Button>
        </>
      }
    >
      <form id="write-off" onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex gap-3">
          <Field label="How many" className="flex-1" error={tooMany ? 'More than the store holds' : undefined}>
            {(id) => <TextInput id={id} inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} />}
          </Field>
          <Field label="Counted in" className="flex-1">
            {(id) => (
              <SelectInput
                id={id}
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'crates' | 'eggs')}
                options={[
                  { value: 'crates', label: `Crates of ${farmSettings.eggsPerCrate}` },
                  { value: 'eggs', label: 'Eggs' },
                ]}
              />
            )}
          </Field>
        </div>
        <Field label="Note" hint="Reason: Broken eggs">
          {(id) => <TextInput id={id} placeholder="e.g. dropped tray at the store" value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}
