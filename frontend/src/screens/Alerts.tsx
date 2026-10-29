'use client'

import { Bell, Check, CircleCheck, ListFilter, Settings, Warehouse } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { Field, TextInput } from '../components/ui/Form'
import { KeyValueRow } from '../components/ui/KeyValueRow'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { Table, TextCell, type Column } from '../components/ui/Table'
import { useToast } from '../components/ui/toastContext'
import { useAlertMarks } from '../data/alertMarks'
import { alertTypes, type AlertMark, type FarmAlert } from '../data/alerts'
import { deriveAlerts } from '../data/derivedAlerts'
import { addDays, dayMonth, dm, timeOf, todayISO } from '../data/metrics'
import type { Catalog } from '../data/remote'
import { useTrade } from '../data/tradeContext'
import { useCurrentUser } from '../data/sessionContext'
import { AlertRow, type AlertKind } from '../features/alerts/AlertRow'

const TYPE_FILTERS = ['All types', ...Object.values(alertTypes)]

const statusLabel = (a: FarmAlert) => (a.status === 'acknowledged' ? `Acknowledged by ${a.acknowledgedBy}` : 'New')

type DisplayAlert = FarmAlert & { markedAt?: string; markNote?: string }

type ResolvedRow = AlertMark & { id: string; title: string; where: string; raised: string }

/**
 * What a resolved alert was, from its id when it has since cleared ("mortality-2-2026-10-28" →
 * Mortality · Pen 2 · 28 Oct). Ids are built in derivedAlerts.ts.
 */
function describeAlert(id: string, catalog: Catalog): { title: string; where: string; raised: string } {
  const pen = (n: string) => catalog.pens.find((p) => p.id === Number(n))?.name ?? `Pen ${n}`
  const m = id.match(/^(mortality|feed|missing)-(\d+)-(\d{4}-\d{2}-\d{2})$/)
  if (m) {
    const kind = { mortality: 'Mortality spike', feed: 'Feed off target', missing: 'Entry missing' }[m[1] as 'mortality' | 'feed' | 'missing']
    return { title: kind, where: pen(m[2]), raised: dayMonth(m[3]) }
  }
  if (id.startsWith('stock-feed-')) return { title: `${id.slice(11)} running low`, where: 'Feed stock', raised: '—' }
  const med = id.match(/^stock-med-(\d+)$/)
  if (med) return { title: `${catalog.medications.find((x) => x.id === Number(med[1]))?.name ?? 'Medication'} running low`, where: 'Medication stock', raised: '—' }
  if (id.startsWith('expiry-')) return { title: 'Medication batch expiring', where: 'Medication stock', raised: '—' }
  const debt = id.match(/^debt-(.+)$/)
  if (debt) return { title: `Overdue debt · ${catalog.customers.find((c) => String(c.id) === debt[1])?.name ?? 'customer'}`, where: 'Customers', raised: '—' }
  return { title: id, where: '—', raised: '—' }
}

const resolvedColumns: Column<ResolvedRow>[] = [
  { key: 'alert', header: 'Alert', render: (r) => <TextCell tone="primary">{r.title}</TextCell> },
  { key: 'where', header: 'Where', width: 160, render: (r) => <TextCell>{r.where}</TextCell> },
  { key: 'raised', header: 'Raised', width: 140, render: (r) => <TextCell>{r.raised}</TextCell> },
  { key: 'by', header: 'Resolved by', width: 170, render: (r) => <TextCell>{`${r.by} · ${dm(r.at.slice(0, 10))} ${timeOf(r.at)}`}</TextCell> },
  { key: 'note', header: 'Note', width: 300, render: (r) => <TextCell>{r.note ?? '—'}</TextCell> },
]

export default function Alerts() {
  const currentUser = useCurrentUser()
  const toast = useToast()
  const router = useRouter()
  const trade = useTrade()
  const derived = useMemo(() => deriveAlerts(trade), [trade])
  // Acknowledged / resolved marks are shared by everyone.
  const { marks, error: marksError, mark: saveMark } = useAlertMarks(trade.catalog, currentUser.id)
  const [type, setType] = useState(TYPE_FILTERS[0])
  const penFilters = ['All pens', ...trade.catalog.pens.map((p) => p.name)]
  const [pen, setPen] = useState(penFilters[0])
  const [selectedId, setSelectedId] = useState<string>()

  const alerts: DisplayAlert[] = derived.map((a) => {
    const m = marks[a.id]
    return m ? { ...a, status: m.status, acknowledgedBy: m.by, markedAt: m.at, markNote: m.note } : a
  })
  const open = alerts.filter((a) => a.status !== 'resolved')
  const acknowledged = alerts.filter((a) => a.status === 'acknowledged')
  const tabs = [`Open · ${open.length}`, `Acknowledged · ${acknowledged.length}`, 'Resolved', 'All']
  const [tab, setTab] = useState(tabs[0])
  const tabKey = tab.split(' · ')[0]

  const penId = trade.catalog.pens.find((p) => p.name === pen)?.id
  const visible = alerts
    .filter((a) =>
      tabKey === 'Open' ? a.status !== 'resolved' : tabKey === 'Acknowledged' ? a.status === 'acknowledged' : tabKey === 'Resolved' ? a.status === 'resolved' : true,
    )
    .filter((a) => type === 'All types' || alertTypes[a.kind as AlertKind] === type)
    .filter((a) => pen === 'All pens' || a.pen === penId)
  const selected = visible.find((a) => a.id === selectedId) ?? visible[0]
  const critical = visible.filter((a) => a.severity === 'Critical').length

  // Resolved in the last 7 days, by anyone.
  const weekFrom = addDays(todayISO(), -6)
  const resolved: ResolvedRow[] = Object.entries(marks)
    .filter(([, m]) => m.status === 'resolved' && m.at.slice(0, 10) >= weekFrom)
    .map(([id, m]) => {
      const live = derived.find((a) => a.id === id)
      const about = live
        ? { title: live.title, where: live.pen ? (trade.catalog.pens.find((p) => p.id === live.pen)?.name ?? `Pen ${live.pen}`) : alertTypes[live.kind], raised: live.time }
        : describeAlert(id, trade.catalog)
      return { id, ...m, ...about }
    })
    .sort((a, b) => b.at.localeCompare(a.at))

  const mark = async (a: FarmAlert, status: AlertMark['status'], note?: string) => {
    const problem = await saveMark(a.id, status, note)
    if (problem) {
      toast(problem)
      return false
    }
    return true
  }

  const acknowledge = async (a: FarmAlert) => {
    if (await mark(a, 'acknowledged')) toast('Alert acknowledged for everyone')
  }
  const resolve = async (a: FarmAlert, note: string) => {
    if (await mark(a, 'resolved', note)) toast('Alert resolved')
  }

  return (
    <>
      <PageHeader
        backTo="/"
        eyebrow={['Dashboard', 'Alerts']}
        title="Alerts"
        description="Alerts are worked out from the farm’s records against the thresholds in Settings, and clear when the problem does. Acknowledging or resolving is shared with everyone."
        actions={
          <Button leadingIcon={Settings} onClick={() => router.push('/settings/feed')}>
            Alert settings
          </Button>
        }
      />

      {marksError && <p className="type-body-sm text-fg-warning">{marksError} Alerts still show, but can’t be acknowledged or resolved yet.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Alert status" options={tabs} value={tabs.find((t) => t.startsWith(tabKey))!} onChange={setTab} />
        <Select label="Alert type" leadingIcon={ListFilter} width={180} options={TYPE_FILTERS} value={type} onChange={setType} />
        <Select label="Pen" leadingIcon={Warehouse} width={180} options={penFilters} value={pen} onChange={setPen} />
        <span className="flex-1" />
        <p className="type-body-sm whitespace-nowrap text-fg-tertiary">WhatsApp alerts aren’t connected yet</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1">
          <CardHeader title={tabKey} meta={critical > 0 && <Badge tone="danger">{critical} critical</Badge>} />
          {visible.length === 0 ? (
            <p className="px-5 pb-6 type-body-md text-fg-tertiary">Nothing here.</p>
          ) : (
            <ul>
              {visible.map((a, i) => (
                <li key={a.id}>
                  <AlertRow
                    kind={a.kind}
                    tone={a.tone}
                    title={a.title}
                    detail={a.status === 'resolved' ? `${a.summary} · Resolved` : `${a.summary} · ${statusLabel(a)}`}
                    time={a.time}
                    selected={a.id === selected?.id}
                    onSelect={() => setSelectedId(a.id)}
                    last={i === visible.length - 1}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
        {selected && <AlertDetail key={selected.id} alert={selected} onAcknowledge={acknowledge} onResolve={resolve} />}
      </div>

      <Card>
        <CardHeader
          title="Resolved this week"
          meta={<span className="type-body-sm text-fg-tertiary">Last 7 days · {resolved.length}</span>}
        />
        {resolved.length ? <Table columns={resolvedColumns} rows={resolved} rowKey={(r) => r.id} /> : <p className="px-5 pb-6 type-body-md text-fg-tertiary">Nothing resolved in the last 7 days.</p>}
      </Card>
    </>
  )
}

type DetailProps = {
  alert: DisplayAlert
  onAcknowledge: (a: FarmAlert) => void
  onResolve: (a: FarmAlert, note: string) => void
}

function AlertDetail({ alert, onAcknowledge, onResolve }: DetailProps) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string>()
  const severityTone = alert.severity === 'Critical' ? 'danger' : alert.severity === 'Warning' ? 'warning' : 'info'

  return (
    <Card className="w-full shrink-0 lg:w-[400px]">
      <CardHeader title={alert.title} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div className="flex gap-2">
          <Badge dot tone={severityTone}>
            {alert.severity}
          </Badge>
          <Badge tone={alert.status === 'new' ? 'info' : alert.status === 'resolved' ? 'success' : 'neutral'}>
            {alert.status === 'new' ? 'New' : alert.status === 'resolved' ? 'Resolved' : 'Acknowledged'}
          </Badge>
        </div>
        {alert.markedAt && alert.status !== 'new' && (
          <p className="type-body-sm text-fg-tertiary">
            {alert.status === 'resolved' ? 'Resolved' : 'Acknowledged'} by {alert.acknowledgedBy} · {dm(alert.markedAt.slice(0, 10))} {timeOf(alert.markedAt)}
            {alert.markNote ? ` · “${alert.markNote}”` : ''}
          </p>
        )}
        <div className="flex flex-col">
          {alert.facts.map(([label, value]) => (
            <KeyValueRow key={label} label={label}>
              {value}
            </KeyValueRow>
          ))}
        </div>
        <p className="type-overline text-fg-tertiary">Notified</p>
        <ul className="-mt-2 flex flex-col gap-3">
          {alert.notified.map((n) => (
            <li key={n.name} className="flex items-center gap-3">
              <Bell size={16} strokeWidth={1.5} className="text-icon-secondary" />
              <span className="flex-1 type-body-md text-fg-secondary">
                {n.name} · {n.channel}
              </span>
              <span className="type-body-sm text-fg-tertiary">{n.state}</span>
            </li>
          ))}
        </ul>
        {alert.status !== 'resolved' && (
          <>
            <Field label="Note (optional)" error={noteError}>
              {(id) => (
                <TextInput
                  id={id}
                  size="md"
                  placeholder="e.g. Vet called, drinkers cleaned"
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value)
                    setNoteError(undefined)
                  }}
                />
              )}
            </Field>
            <div className="flex gap-2">
              <Button
                variant="primary"
                leadingIcon={Check}
                className="flex-1"
                disabled={alert.status === 'acknowledged'}
                onClick={() => onAcknowledge(alert)}
              >
                {alert.status === 'acknowledged' ? 'Acknowledged' : 'Acknowledge'}
              </Button>
              <Button className="flex-1" onClick={() => router.push(alert.link.to)}>
                {alert.link.label}
              </Button>
            </div>
            <Button
              variant="ghost"
              leadingIcon={CircleCheck}
              onClick={() => (note.trim() ? onResolve(alert, note.trim()) : setNoteError('Add a note to resolve this alert'))}
            >
              Resolve with note
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}
