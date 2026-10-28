'use client'

import { Check, CircleCheck, ListFilter, MessageCircle, Settings, Warehouse } from 'lucide-react'
import { useState } from 'react'
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
import { alertTypes, farmAlerts, resolvedThisWeek, whatsappRecipients, type FarmAlert, type ResolvedAlert } from '../data/alerts'
import { useCurrentUser } from '../data/sessionContext'
import { AlertRow, type AlertKind } from '../features/alerts/AlertRow'

const TYPE_FILTERS = ['All types', ...Object.values(alertTypes)]
const PEN_FILTERS = ['All pens', 'Pen 1', 'Pen 2', 'Pen 3', 'Pen 4', 'Pen 5', 'Pen 6']

const statusLabel = (a: FarmAlert) => (a.status === 'acknowledged' ? `Acknowledged by ${a.acknowledgedBy}` : 'New')

const resolvedColumns: Column<ResolvedAlert>[] = [
  { key: 'alert', header: 'Alert', render: (r) => <TextCell tone="primary">{r.title}</TextCell> },
  { key: 'where', header: 'Where', width: 160, render: (r) => <TextCell>{r.where}</TextCell> },
  { key: 'raised', header: 'Raised', width: 140, render: (r) => <TextCell>{r.raised}</TextCell> },
  { key: 'by', header: 'Resolved by', width: 170, render: (r) => <TextCell>{r.resolvedBy}</TextCell> },
  { key: 'note', header: 'Note', width: 300, render: (r) => <TextCell>{r.note}</TextCell> },
]

export default function Alerts() {
  const currentUser = useCurrentUser()
  const toast = useToast()
  const [alerts, setAlerts] = useState(farmAlerts)
  const [resolved, setResolved] = useState(resolvedThisWeek)
  const [type, setType] = useState(TYPE_FILTERS[0])
  const [pen, setPen] = useState(PEN_FILTERS[0])
  const [selectedId, setSelectedId] = useState(farmAlerts[0].id)

  const open = alerts.filter((a) => a.status !== 'resolved')
  const acknowledged = alerts.filter((a) => a.status === 'acknowledged')
  const tabs = [`Open · ${open.length}`, `Acknowledged · ${acknowledged.length}`, 'Resolved', 'All']
  const [tab, setTab] = useState(tabs[0])
  const tabKey = tab.split(' · ')[0]

  const visible = alerts
    .filter((a) =>
      tabKey === 'Open' ? a.status !== 'resolved' : tabKey === 'Acknowledged' ? a.status === 'acknowledged' : tabKey === 'Resolved' ? a.status === 'resolved' : true,
    )
    .filter((a) => type === 'All types' || alertTypes[a.kind as AlertKind] === type)
    .filter((a) => pen === 'All pens' || a.pen === Number(pen.split(' ')[1]))
  const selected = visible.find((a) => a.id === selectedId) ?? visible[0]
  const critical = visible.filter((a) => a.severity === 'Critical').length

  const update = (id: string, patch: Partial<FarmAlert>) => setAlerts((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const me = currentUser.name.split(' ')[0]

  const acknowledge = (a: FarmAlert) => {
    update(a.id, { status: 'acknowledged', acknowledgedBy: me })
    toast('Alert acknowledged')
  }
  const resolve = (a: FarmAlert, note: string) => {
    update(a.id, { status: 'resolved' })
    setResolved((r) => [{ title: a.title, where: a.pen ? `Pen ${a.pen}` : alertTypes[a.kind], raised: 'Fri 09/10', resolvedBy: `${me} · now`, note }, ...r])
    toast('Alert resolved')
  }

  return (
    <>
      <PageHeader
        backTo="/"
        eyebrow={['Dashboard', 'Alerts']}
        title="Alerts"
        description="Every alert comes from a threshold set in Settings. Everyone notified sees the same status."
        actions={<Button leadingIcon={Settings}>Alert settings</Button>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Alert status" options={tabs} value={tabs.find((t) => t.startsWith(tabKey))!} onChange={setTab} />
        <Select label="Alert type" leadingIcon={ListFilter} width={180} options={TYPE_FILTERS} value={type} onChange={setType} />
        <Select label="Pen" leadingIcon={Warehouse} width={180} options={PEN_FILTERS} value={pen} onChange={setPen} />
        <span className="flex-1" />
        <p className="type-body-sm whitespace-nowrap text-fg-tertiary">WhatsApp alerts on for {whatsappRecipients} people</p>
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
          meta={<span className="type-body-sm text-fg-tertiary">{resolved.length} alerts</span>}
          action={{ label: 'View all', to: '/alerts' }}
        />
        <Table columns={resolvedColumns} rows={resolved} rowKey={(r) => r.title + r.raised} />
      </Card>
    </>
  )
}

type DetailProps = {
  alert: FarmAlert
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
              <MessageCircle size={16} strokeWidth={1.5} className="text-icon-secondary" />
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
