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
import { feedTypes, medications } from '../../data/inventory'
import { nowHM, todayISO, unitCost, weekdayDayMonth } from '../../data/metrics'
import { people } from '../../data/stockMetrics'
import { downloadCsv } from '../../lib/export'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

/** A flat line for KPIs with no daily trend to show. */
const FLAT = [0, 0]

type Item = {
  name: string
  batch: string | null
  unit: string
  expected: number
  /** ₦ per stock unit, for the value of any adjustment */
  unitCost: number
  /** Differences bigger than this wait for the farm manager before stock changes. */
  limit: number
  counted: string
  reason: string
  at: string
}


/** ST-D51 · Weekly blind count. Each item starts empty; the expected figure shows once it is counted. */
export default function WeeklyCount() {
  const toast = useToast()
  const user = useCurrentUser()
  const { stockOf, addStockMoves, history, catalog } = useTrade()
  const first = user.name.split(' ')[0]
  const { manager } = people(catalog)

  const [items, setItems] = useState<Item[]>(() => {
    const feeds: Item[] = feedTypes.map((f) => ({
      name: f.name, batch: null, unit: 'bags', expected: stockOf(f.name),
      unitCost: unitCost(history, { feedTypeId: catalog.feedTypes.find((x) => x.name === f.name)?.id }), limit: 2,
      counted: '', reason: '', at: '',
    }))
    const meds: Item[] = medications.map((m) => ({
      name: m.name, batch: m.batch === '—' ? null : m.batch, unit: m.unit, expected: stockOf(m.name),
      unitCost: unitCost(history, { medicationId: catalog.medications.find((x) => x.name === m.name)?.id }), limit: m.unit === 'g' ? 100 : 1,
      counted: '', reason: '', at: '',
    }))
    return [...feeds, ...meds]
  })
  const [sentAt, setSentAt] = useState<string | null>(null)
  const [showSent, setShowSent] = useState(true)

  const diffOf = (i: Item) => (i.counted.trim() === '' ? null : Number(i.counted.replace(/,/g, '')) - i.expected)
  const counted = items.filter((i) => diffOf(i) !== null)
  const differences = items.filter((i) => (diffOf(i) ?? 0) !== 0)
  const missingReason = differences.filter((i) => !i.reason.trim())
  const bigger = differences.filter((i) => Math.abs(diffOf(i)!) > i.limit)
  const value = differences.reduce((n, i) => n + Math.abs(diffOf(i)!) * i.unitCost, 0)
  // The time is stamped when an item is first counted.
  const update = (name: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.name === name ? { ...i, ...patch, at: i.at || ('counted' in patch ? nowHM() : '') } : i)))
  const times = items.map((i) => i.at).filter(Boolean).sort()
  const span = times.length ? (times[0] === times[times.length - 1] ? times[0] : `${times[0]}–${times[times.length - 1]}`) : 'not started'

  const send = async () => {
    // Small differences change stock now; bigger ones wait for the farm manager.
    if (!(await addStockMoves(differences.filter((i) => !bigger.includes(i)).map((i) => ({ item: i.name, qty: diffOf(i)!, type: 'adjust', source: `Count by ${first}: ${i.reason}` }))))) return
    setSentAt(nowHM())
    toast(`Count sent to ${manager}`)
  }

  const kpis: Kpi[] = [
    { label: 'Counted', value: String(counted.length), unit: `of ${items.length} items`, delta: counted.length === items.length ? 'Done' : 'In progress', trend: 'flat', sentiment: 'neutral', context: span, info: 'Items with a count entered on this screen, out of all feed and medication items.', spark: FLAT },
    { label: 'Matched', value: String(counted.length - differences.length), unit: 'items', delta: '—', trend: 'flat', sentiment: 'neutral', context: 'as the app expected', info: 'Counted items where the count equals the stock the app expected (opening + received − used ± earlier counts).', spark: FLAT },
    { label: 'Differences', value: String(differences.length), unit: bigger.length ? `need ${manager}` : 'small', delta: missingReason.length ? `${missingReason.length} need a reason` : 'Saved', trend: 'flat', sentiment: 'neutral', context: 'with reasons', info: 'Counted items where the count is different from the stock the app expected. Big differences need a manager to approve.', spark: FLAT },
    { label: 'Value adjusted', value: (value / 1000).toFixed(1), unit: 'thousand ₦', delta: differences.map((i) => `${diffOf(i)! > 0 ? '+' : '−'}${formatNumber(Math.abs(diffOf(i)!))} ${i.unit === 'bags' && Math.abs(diffOf(i)!) === 1 ? 'bag' : i.unit}`).join(' · ') || 'None', trend: 'flat', sentiment: 'neutral', context: 'at average cost', info: 'Each difference × the average price paid a unit (from purchases), added up.', spark: FLAT },
  ]

  const columns: Column<Item>[] = [
    { key: 'name', header: 'Item', render: (i) => <TextCell tone="primary">{i.name}</TextCell> },
    { key: 'batch', header: 'Batch', width: 110, render: (i) => <TextCell>{i.batch ?? '—'}</TextCell> },
    {
      key: 'counted',
      header: 'Counted',
      width: 120,
      render: (i) =>
        sentAt ? (
          <TextCell tone="primary" mono>{`${formatNumber(Number(i.counted))} ${i.unit}`}</TextCell>
        ) : (
          <label className="flex items-center gap-1.5">
            <input
              aria-label={`${i.name} counted`}
              inputMode="numeric"
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
        return <NumberCell tone={d === 0 ? 'default' : 'warning'}>{d === 0 ? '0' : `${d > 0 ? '+' : '−'}${formatNumber(Math.abs(d))} ${i.unit === 'bags' && Math.abs(d) === 1 ? 'bag' : i.unit}`}</NumberCell>
      },
    },
    {
      key: 'reason',
      header: 'Reason',
      width: 160,
      render: (i) =>
        (diffOf(i) ?? 0) === 0 ? (
          <TextCell tone="tertiary">—</TextCell>
        ) : sentAt ? (
          <TextCell tone="primary">{i.reason}</TextCell>
        ) : (
          <input
            aria-label={`${i.name} reason`}
            placeholder="Why?"
            value={i.reason}
            onChange={(e) => update(i.name, { reason: e.target.value })}
            className={`h-8 w-full rounded-sm border px-2 type-body-sm ${i.reason.trim() ? 'border-line-strong' : 'border-line-danger'}`}
          />
        ),
    },
    { key: 'at', header: 'Counted at', align: 'right', width: 100, render: (i) => <NumberCell>{i.at}</NumberCell> },
    {
      key: 'status',
      header: 'Status',
      width: 140,
      render: (i) => {
        const d = diffOf(i)
        if (d === null) return <Badge tone="neutral">Not counted</Badge>
        if (d === 0) return <Badge dot tone="success">Matched</Badge>
        if (Math.abs(d) > i.limit) return <Badge dot tone="warning">Waits for {manager}</Badge>
        return <Badge dot tone={i.reason.trim() ? 'info' : 'danger'}>{i.reason.trim() ? 'Saved' : 'Needs a reason'}</Badge>
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
                  ['Item', 'Batch', 'Unit', 'Counted', 'App expected', 'Difference', 'Reason', 'Counted at'],
                  items.map((i) => [i.name, i.batch, i.unit, i.counted, diffOf(i) === null ? '' : i.expected, diffOf(i), i.reason, i.at]),
                )
              }
            >
              Export
            </Button>
            <Button variant="primary" leadingIcon={Send} disabled={!!sentAt || missingReason.length > 0 || counted.length < items.length} onClick={send}>
              {sentAt ? `Sent to ${manager} · ${sentAt}` : `Send to ${manager}`}
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
        <Alert tone="success" icon={CircleCheck} title={`Results sent to ${manager} at ${sentAt}`} onDismiss={() => setShowSent(false)}>
          {differences.map((i) => `${i.name} ${diffOf(i)! > 0 ? '+' : '−'}${formatNumber(Math.abs(diffOf(i)!))} ${i.unit === 'bags' && Math.abs(diffOf(i)!) === 1 ? 'bag' : i.unit} (${i.reason.toLowerCase()})`).join(' and ') || 'Everything matched'}
          {differences.length ? ` ${bigger.length ? `are sent with your reasons; the bigger ones wait for ${manager} before stock changes.` : `are saved with ${first}’s reasons. Bigger differences would wait for ${manager} before stock changes.`}` : '.'}
        </Alert>
      )}
      <Card>
        <CardHeader title="This week’s count" meta={<span className="type-body-sm text-fg-tertiary">Counted blind · expected shown after</span>} />
        <Table columns={columns} rows={items} rowKey={(i) => i.name} />
      </Card>
    </>
  )
}
