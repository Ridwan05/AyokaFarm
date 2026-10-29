'use client'

import { CircleCheck, Download, Send } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard, type Kpi } from '../../components/ui/KpiCard'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import type { StockMove } from '../../data/deliveries'
import { farmSettings } from '../../data/farmSettings'
import { feedTypes, medications } from '../../data/inventory'
import { nowHM, staffWithRole, todayISO, unitCost, weekdayDayMonth } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { PendingCounts } from '../../features/stock/PendingCounts'
import { downloadCsv } from '../../lib/export'
import { formatNumber } from '../../lib/format'

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

type Item = {
  name: string
  /** Eggs aren't named stock items; they're saved against the egg store. */
  stockItem?: 'eggs' | 'cracked_eggs'
  unit: string
  expected: number
  /** ₦ per counted unit, for the value of any adjustment */
  unitCost: number
  /** Differences bigger than this wait for a manager before stock changes. */
  limit: number
  counted: string
  reason: string
  note: string
  at: string
}

const num = (v: string) => Number(v.replace(/,/g, ''))

/** ST-D51 · Weekly blind count. Each item starts empty; the expected figure shows once it is counted. */
export default function WeeklyCount() {
  const toast = useToast()
  const user = useCurrentUser()
  const { stockOf, addStockMoves, history, catalog } = useTrade()
  const first = user.name.split(' ')[0]
  // Who decides the big differences: the farm manager(s), or the owner when there's none.
  const deciders = staffWithRole(catalog, 'farm_manager').concat(staffWithRole(catalog, 'farm_manager').length ? [] : staffWithRole(catalog, 'owner'))
  const manager = deciders.length ? deciders.join(' or ') : 'the farm manager'
  const reasons = catalog.reasons.filter((r) => r.is_active && !/opening/i.test(r.name)).map((r) => r.name)
  const eggsOnHand = (item: 'eggs' | 'cracked_eggs') => catalog.levels.find((l) => l.item === item)?.onHand ?? 0

  const [items, setItems] = useState<Item[]>(() => {
    const blank = { counted: '', reason: '', note: '', at: '' }
    const feeds: Item[] = feedTypes.map((f) => ({
      name: f.name, unit: 'bags', expected: stockOf(f.name),
      unitCost: unitCost(history, { feedTypeId: catalog.feedTypes.find((x) => x.name === f.name)?.id }), limit: 2, ...blank,
    }))
    const meds: Item[] = medications.map((m) => ({
      name: m.name, unit: m.unit, expected: stockOf(m.name),
      unitCost: unitCost(history, { medicationId: catalog.medications.find((x) => x.name === m.name)?.id }), limit: m.unit === 'g' ? 100 : 1, ...blank,
    }))
    // Eggs are counted in crates; stock keeps eggs.
    const eggs: Item[] = (['eggs', 'cracked_eggs'] as const).map((k) => ({
      name: k === 'eggs' ? 'Eggs' : 'Cracked eggs', stockItem: k, unit: 'crates',
      expected: Math.round((eggsOnHand(k) / farmSettings.eggsPerCrate) * 10) / 10, unitCost: 0, limit: 1, ...blank,
    }))
    return [...feeds, ...meds, ...eggs]
  })
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [showSent, setShowSent] = useState(true)
  const [saving, setSaving] = useState(false)

  const diffOf = (i: Item) => (i.counted.trim() === '' ? null : Math.round((num(i.counted) - i.expected) * 10) / 10)
  const counted = items.filter((i) => diffOf(i) !== null)
  const differences = items.filter((i) => (diffOf(i) ?? 0) !== 0)
  const missingReason = differences.filter((i) => !i.reason)
  const bigger = differences.filter((i) => Math.abs(diffOf(i)!) > i.limit)
  const value = differences.reduce((n, i) => n + Math.abs(diffOf(i)!) * i.unitCost, 0)
  // The time is stamped when an item is first counted.
  const update = (name: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.name === name ? { ...i, ...patch, at: i.at || ('counted' in patch ? nowHM() : '') } : i)))
  const times = items.map((i) => i.at).filter(Boolean).sort()
  const span = times.length ? (times[0] === times[times.length - 1] ? times[0] : `${times[0]}–${times[times.length - 1]}`) : 'not started'
  const unitText = (i: Item, n: number) => `${formatNumber(Math.abs(n))} ${i.unit === 'bags' && Math.abs(n) === 1 ? 'bag' : i.unit === 'crates' && Math.abs(n) === 1 ? 'crate' : i.unit}`

  const send = async () => {
    // Every counted line is saved, matching ones too, so the farm knows when stock was last checked.
    // Small differences change stock now; bigger ones wait for a manager.
    const toEggs = (i: Item, n: number) => (i.stockItem ? Math.round(n * farmSettings.eggsPerCrate) : n)
    const moves: StockMove[] = counted.map((i) => {
      const d = diffOf(i)!
      return {
        item: i.name,
        stockItem: i.stockItem,
        qty: toEggs(i, d),
        counted: toEggs(i, num(i.counted)),
        type: 'adjust',
        reason: d === 0 ? 'Recount' : i.reason,
        pending: Math.abs(d) > i.limit,
        source: `Count by ${first}${i.note.trim() ? `: ${i.note.trim()}` : ''}`,
      }
    })
    setSaving(true)
    const ok = await addStockMoves(moves)
    setSaving(false)
    if (!ok) return
    setSentAt(nowHM())
    toast(bigger.length ? `Count saved · ${bigger.length} ${bigger.length === 1 ? 'difference waits' : 'differences wait'} for ${manager}` : 'Count saved')
  }

  const kpis: Kpi[] = [
    { label: 'Counted', value: String(counted.length), unit: `of ${items.length} items`, delta: counted.length === items.length ? 'Done' : 'In progress', trend: 'flat', sentiment: 'neutral', context: span, info: 'Items with a count entered on this screen, out of all feed, medication and egg items.', spark: FLAT },
    { label: 'Matched', value: String(counted.length - differences.length), unit: 'items', delta: '—', trend: 'flat', sentiment: 'neutral', context: 'as the app expected', info: 'Counted items where the count equals the stock the app expected (opening + received − used ± earlier counts).', spark: FLAT },
    { label: 'Differences', value: String(differences.length), unit: bigger.length ? `${bigger.length} wait for approval` : 'small', delta: missingReason.length ? `${missingReason.length} need a reason` : 'Reasons given', trend: 'flat', sentiment: 'neutral', context: 'with reasons', info: `Counted items where the count is different from the stock the app expected. Differences above the limit wait for ${manager} before stock changes.`, spark: FLAT },
    { label: 'Value adjusted', value: (value / 1000).toFixed(1), unit: 'thousand ₦', delta: differences.filter((i) => i.unitCost).map((i) => `${diffOf(i)! > 0 ? '+' : '−'}${unitText(i, diffOf(i)!)}`).join(' · ') || 'None', trend: 'flat', sentiment: 'neutral', context: 'at average cost', info: 'Each feed and medication difference × the average price paid a unit (from purchases), added up. Eggs aren’t valued here.', spark: FLAT },
  ]

  const columns: Column<Item>[] = [
    { key: 'name', header: 'Item', render: (i) => <TextCell tone="primary">{i.name}</TextCell> },
    {
      key: 'counted',
      header: 'Counted',
      width: 130,
      render: (i) =>
        sentAt ? (
          <TextCell tone="primary" mono>{i.counted ? `${formatNumber(num(i.counted))} ${i.unit}` : '—'}</TextCell>
        ) : (
          <label className="flex items-center gap-1.5">
            <input
              aria-label={`${i.name} counted`}
              inputMode="decimal"
              value={i.counted}
              onChange={(e) => update(i.name, { counted: e.target.value })}
              className="h-8 w-16 rounded-sm border border-line-strong px-2 type-mono-sm text-fg-primary"
            />
            <span className="type-body-sm text-fg-tertiary">{i.unit}</span>
          </label>
        ),
    },
    // Counted blind: the expected figure only shows once something is counted.
    { key: 'expected', header: 'App expected', align: 'right', width: 110, render: (i) => (diffOf(i) === null ? <NumberCell tone="muted">—</NumberCell> : <NumberCell>{formatNumber(i.expected)} {i.unit}</NumberCell>) },
    {
      key: 'diff',
      header: 'Difference',
      align: 'right',
      width: 100,
      render: (i) => {
        const d = diffOf(i)
        if (d === null) return <NumberCell tone="muted">—</NumberCell>
        return <NumberCell tone={d === 0 ? 'default' : 'warning'}>{d === 0 ? '0' : `${d > 0 ? '+' : '−'}${unitText(i, d)}`}</NumberCell>
      },
    },
    {
      key: 'reason',
      header: 'Reason',
      width: 220,
      render: (i) =>
        (diffOf(i) ?? 0) === 0 ? (
          <TextCell tone="tertiary">—</TextCell>
        ) : sentAt ? (
          <TextCell tone="primary">{[i.reason, i.note.trim()].filter(Boolean).join(' · ')}</TextCell>
        ) : (
          <span className="flex flex-col gap-1">
            <select
              aria-label={`${i.name} reason`}
              value={i.reason}
              onChange={(e) => update(i.name, { reason: e.target.value })}
              className={`h-8 w-full rounded-sm border bg-surface px-2 type-body-sm ${i.reason ? 'border-line-strong' : 'border-line-danger'}`}
            >
              <option value="">Why?</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              aria-label={`${i.name} note`}
              placeholder="Note (optional)"
              value={i.note}
              onChange={(e) => update(i.name, { note: e.target.value })}
              className="h-8 w-full rounded-sm border border-line-strong px-2 type-body-sm"
            />
          </span>
        ),
    },
    { key: 'at', header: 'Counted at', align: 'right', width: 100, render: (i) => <NumberCell>{i.at}</NumberCell> },
    {
      key: 'status',
      header: 'Status',
      width: 150,
      render: (i) => {
        const d = diffOf(i)
        if (d === null) return <Badge tone="neutral">Not counted</Badge>
        if (d === 0) return <Badge dot tone="success">Matched</Badge>
        if (Math.abs(d) > i.limit) return <Badge dot tone="warning">Waits for {manager}</Badge>
        return <Badge dot tone={i.reason ? 'info' : 'danger'}>{i.reason ? 'Applied when sent' : 'Needs a reason'}</Badge>
      },
    },
  ]

  return (
    <>
      <PageHeader
        backTo="/inventory/feed"
        eyebrow={['Operate', 'Inventory', 'Weekly count']}
        title="Weekly count"
        description={`${weekdayDayMonth(todayISO())} · counted by ${first}, ${span}. The app shows what it expected only after each item is counted.`}
        actions={
          <>
            <Button
              leadingIcon={Download}
              onClick={() =>
                downloadCsv(
                  'stock-count',
                  ['Item', 'Unit', 'Counted', 'App expected', 'Difference', 'Reason', 'Note', 'Counted at'],
                  items.map((i) => [i.name, i.unit, i.counted, diffOf(i) === null ? '' : i.expected, diffOf(i), i.reason, i.note, i.at]),
                )
              }
            >
              Export
            </Button>
            <Button variant="primary" leadingIcon={Send} disabled={!!sentAt || saving || missingReason.length > 0 || counted.length === 0} onClick={send}>
              {sentAt ? `Saved · ${sentAt}` : saving ? 'Saving…' : 'Save count'}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>
      {sentAt && showSent && (
        <Alert tone="success" icon={CircleCheck} title={`Count saved at ${sentAt}`} onDismiss={() => setShowSent(false)}>
          {differences.length
            ? `${differences.filter((i) => !bigger.includes(i)).length} small ${differences.length - bigger.length === 1 ? 'difference was' : 'differences were'} applied to stock.${bigger.length ? ` ${bigger.map((i) => `${i.name} ${diffOf(i)! > 0 ? '+' : '−'}${unitText(i, diffOf(i)!)}`).join(', ')} ${bigger.length === 1 ? 'waits' : 'wait'} for ${manager} before stock changes.` : ''}`
            : 'Everything matched. The count is recorded.'}
        </Alert>
      )}
      <PendingCounts />
      <Card>
        <CardHeader title="This week’s count" meta={<span className="type-body-sm text-fg-tertiary">Counted blind · expected shown after · eggs in crates</span>} />
        <Table columns={columns} rows={items} rowKey={(i) => i.name} />
      </Card>
    </>
  )
}
