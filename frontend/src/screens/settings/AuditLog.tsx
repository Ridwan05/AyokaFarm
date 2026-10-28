'use client'

import { CalendarDays, Download, History, ListFilter, Users } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { SearchInput } from '../../components/ui/Form'
import { Select } from '../../components/ui/Select'
import { PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { AUDIT_TOTAL_THIS_WEEK, auditLog, auditTone, roleLabels, staff, type AuditEntry } from '../../data/settings'
import { SettingsHeader } from './SettingsHeader'

const PERIODS = ['Last 7 days', 'Last 30 days', 'All time'] as const
const ACTIONS = ['All actions', ...Object.keys(auditTone)]
const person = (id: string) => staff.find((s) => s.id === id)!

const columns: Column<AuditEntry>[] = [
  { key: 'when', header: 'When', width: 104, render: (e) => <TextCell tone="primary">{e.when}</TextCell> },
  { key: 'who', header: 'Who', width: 200, render: (e) => <PrimaryCell initials={person(e.who).initials} title={person(e.who).name} subtitle={roleLabels[person(e.who).role]} /> },
  {
    key: 'action',
    header: 'Action',
    width: 150,
    render: (e) => (
      <Badge dot tone={auditTone[e.action]}>
        {e.action}
      </Badge>
    ),
  },
  { key: 'record', header: 'Record', width: 236, render: (e) => <TextCell tone="primary">{e.record}</TextCell> },
  { key: 'change', header: 'Change', render: (e) => <TextCell tone="primary">{e.change}</TextCell> },
  { key: 'reason', header: 'Reason', width: 174, render: (e) => <TextCell tone={e.reason ? 'primary' : 'tertiary'}>{e.reason ?? '—'}</TextCell> },
]

export default function AuditLog() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('Last 7 days')
  const [who, setWho] = useState('Everyone')
  const [action, setAction] = useState('All actions')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = auditLog
    .filter((e) => who === 'Everyone' || person(e.who).name === who)
    .filter((e) => action === 'All actions' || e.action === action)
    .filter((e) => !q || `${e.record} ${e.change} ${e.reason ?? ''}`.toLowerCase().includes(q))

  return (
    <>
      <SettingsHeader title="Audit log" description="Who did what, and when, for every create, edit and delete. Nothing is ever hard-deleted." actions={<Button leadingIcon={Download}>Export</Button>} />
      <div className="flex flex-wrap items-center gap-3">
        <Select label="Period" leadingIcon={CalendarDays} width={170} options={PERIODS} value={period} onChange={setPeriod} />
        <Select label="Who" leadingIcon={Users} width={170} options={['Everyone', ...staff.map((s) => s.name)]} value={who} onChange={setWho} />
        <Select label="Action" leadingIcon={ListFilter} width={170} options={ACTIONS} value={action} onChange={setAction} />
        <span className="flex-1" />
        <SearchInput label="Search records" placeholder="Search records" width={240} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <Card>
        <CardHeader title="Changes" meta={<span className="type-body-sm text-fg-tertiary">Showing {rows.length} of {AUDIT_TOTAL_THIS_WEEK} this week</span>} />
        <Table columns={columns} rows={rows} rowKey={(e) => e.when + e.record} />
      </Card>
      <p className="-mt-2 flex items-center gap-2 type-body-sm text-fg-secondary">
        <History size={16} strokeWidth={1.5} className="text-icon-secondary" />
        Deleted records stay here with their reason, and an Admin can restore them. Editing a back-dated sale or purchase recalculates every later balance for that party (BR-1).
      </p>
    </>
  )
}
