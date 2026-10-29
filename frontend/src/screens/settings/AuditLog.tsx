'use client'

import { CalendarDays, Download, History, ListFilter, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Tone } from '../../components/ui/Badge'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { SearchInput } from '../../components/ui/Form'
import { Select } from '../../components/ui/Select'
import { PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { addDays, dm, timeOf, todayISO } from '../../data/metrics'
import { initialsOf } from '../../data/session'
import { useTrade } from '../../data/tradeContext'
import { downloadCsv } from '../../lib/export'
import { createClient } from '../../lib/supabase/client'
import type { Json, Tables } from '../../lib/supabase/database.types'
import { SettingsHeader } from './SettingsHeader'

// The audit log is written by database triggers on every insert, update and delete. Rows are read
// on demand, a page at a time, and turned into plain-language entries here.

const PAGE = 200
const PERIODS = ['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time'] as const
type Period = (typeof PERIODS)[number]
const PERIOD_DAYS: Record<Period, number | null> = { 'Last 7 days': 7, 'Last 30 days': 30, 'Last 90 days': 90, 'All time': null }

type AuditAction = 'Created' | 'Edited' | 'Deleted' | 'Restored' | 'Setting changed' | 'Adjusted' | 'Approval asked' | 'Approved' | 'Rejected'
const auditTone: Record<AuditAction, Tone> = {
  'Approval asked': 'warning',
  Created: 'neutral',
  Edited: 'info',
  'Setting changed': 'warning',
  Adjusted: 'info',
  Deleted: 'danger',
  Restored: 'success',
  Approved: 'success',
  Rejected: 'danger',
}
const ACTIONS = ['All actions', ...(Object.keys(auditTone) as AuditAction[])]

const SETTINGS_TABLES = new Set(['roles', 'role_permissions', 'farm_settings', 'bird_types', 'feed_types', 'feed_targets', 'medications', 'products', 'expense_categories', 'adjustment_reasons', 'profiles', 'staff_pens', 'pens'])
/** Columns that change as a side effect, or are ids — not worth showing as a change. */
const QUIET = new Set(['updated_at', 'created_at', 'id', 'opening_birds', 'closing_birds', 'recorded_by', 'created_by', 'deleted_by', 'approved_by', 'approved_at'])

type Row = Tables<'audit_log'>
type Entry = { id: number; at: string; when: string; whoId: string | null; action: AuditAction; record: string; change: string; reason: string | null }

const obj = (j: Json | null) => (j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, Json>) : {})
const show = (v: Json | undefined) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const label = (key: string) => key.replace(/_id$/, '').replace(/_/g, ' ')

export default function AuditLog() {
  const { catalog } = useTrade()
  const [period, setPeriod] = useState<Period>('Last 7 days')
  const [who, setWho] = useState('Everyone')
  const [action, setAction] = useState('All actions')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'more' | { error: string }>('loading')

  const people = catalog.profiles
  const personId = who === 'Everyone' ? null : (people.find((p) => p.full_name === who)?.id ?? null)

  const fetchPage = useCallback(
    async (from: number) => {
      const days = PERIOD_DAYS[period]
      let q = createClient().from('audit_log').select('*', { count: 'exact' }).order('occurred_at', { ascending: false }).order('id', { ascending: false })
      if (days) q = q.gte('occurred_at', `${addDays(todayISO(), -(days - 1))}T00:00:00+01:00`)
      if (personId) q = q.eq('actor_id', personId)
      return q.range(from, from + PAGE - 1)
    },
    [period, personId],
  )

  useEffect(() => {
    let cancelled = false
    // The log is read on demand from Supabase (an external system), so setting state here is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    setState('loading')
    void fetchPage(0).then(({ data, error, count }) => {
      if (cancelled) return
      if (error) return setState({ error: error.message })
      setRows(data ?? [])
      setTotal(count)
      setState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [fetchPage])

  async function loadMore() {
    setState('more')
    const { data, error } = await fetchPage(rows.length)
    if (error) return setState({ error: error.message })
    setRows((r) => [...r, ...(data ?? [])])
    setState('ready')
  }

  const describe = useMemo(() => {
    const penName = (id: Json | undefined) => catalog.pens.find((p) => p.id === Number(id))?.name ?? `Pen ${show(id)}`
    const name = (table: string, d: Record<string, Json>) => {
      switch (table) {
        case 'sales':
          return `Sale ${show(d.ref)}`
        case 'purchases':
          return `Purchase ${show(d.ref)}`
        case 'payments':
          return `Payment ${show(d.ref)}`
        case 'expenses':
          return `Expense ${show(d.ref)}`
        case 'production_records':
          return `${penName(d.pen_id)} entry · ${typeof d.record_date === 'string' ? dm(d.record_date) : '—'}`
        case 'production_medications':
          return `Medication given · ${catalog.medications.find((m) => m.id === Number(d.medication_id))?.name ?? '—'}`
        case 'stock_adjustments': {
          const item = d.feed_type_id ? catalog.feedTypes.find((f) => f.id === Number(d.feed_type_id))?.name : d.medication_id ? catalog.medications.find((m) => m.id === Number(d.medication_id))?.name : d.item === 'cracked_eggs' ? 'Cracked eggs' : 'Eggs'
          return `${item ?? 'Stock'} stock${d.is_opening ? ' · opening' : ''}`
        }
        case 'farm_settings':
          return 'Farm settings'
        case 'role_permissions':
          return `Permissions · ${show(d.role_id).replace(/_/g, ' ')} · ${show(d.module)}`
        case 'roles':
          return `Role ${show(d.name)}`
        case 'feed_targets':
          return `Feed band from week ${show(d.week_from)}`
        case 'staff_pens':
          return `Pen assignment · ${people.find((p) => p.id === d.profile_id)?.full_name ?? '—'} · ${penName(d.pen_id)}`
        case 'profiles':
          return `Staff · ${show(d.full_name)}`
        case 'flocks':
          return `Flock ${show(d.code)}`
        case 'pens':
          return `Pen ${show(d.name)}`
        default:
          return `${label(table.replace(/s$/, '')).replace(/^./, (c) => c.toUpperCase())} ${show(d.name ?? d.ref ?? '')}`.trim()
      }
    }
    return (r: Row): Entry => {
      const before = obj(r.old_data)
      const after = obj(r.new_data)
      const d = r.action === 'delete' ? before : after
      let action: AuditAction = SETTINGS_TABLES.has(r.table_name) ? 'Setting changed' : r.action === 'insert' ? 'Created' : r.action === 'delete' ? 'Deleted' : 'Edited'
      let change = ''
      let reason: string | null = null
      if (r.action === 'insert') {
        if (r.table_name === 'stock_adjustments') action = d.is_opening ? 'Created' : 'Adjusted'
        if (r.table_name === 'sales' && d.approval === 'pending') action = 'Approval asked'
        const picks = ['total', 'amount', 'quantity', 'quantity_change', 'mortality', 'eggs_collected', 'unit_price', 'opening_balance', 'name'].filter((k) => k in d && d[k] !== null)
        change = picks.slice(0, 3).map((k) => `${label(k)} ${show(d[k])}`).join(' · ') || 'Added'
        reason = typeof d.note === 'string' ? d.note : null
      } else if (r.action === 'delete') {
        change = 'Removed'
      } else {
        if (!before.deleted_at && after.deleted_at) {
          action = 'Deleted'
          reason = show(after.delete_reason)
          change = 'Marked deleted'
        } else if (before.deleted_at && !after.deleted_at) {
          action = 'Restored'
          change = 'Restored'
        } else if (r.table_name === 'sales' && before.approval !== after.approval && (after.approval === 'approved' || after.approval === 'rejected')) {
          action = after.approval === 'approved' ? 'Approved' : 'Rejected'
          change = `${show(after.quantity)} at ₦${Number(after.unit_price).toLocaleString('en-NG')}`
        }
        if (!change) {
          const keys = Object.keys(after).filter((k) => !QUIET.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
          change = keys.slice(0, 3).map((k) => `${label(k)} ${show(before[k])} → ${show(after[k])}`).join(' · ') + (keys.length > 3 ? ` · +${keys.length - 3} more` : '') || 'No visible change'
        }
      }
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(r.occurred_at))
      return { id: r.id, at: r.occurred_at, when: `${dm(date)} ${timeOf(r.occurred_at)}`, whoId: r.actor_id, action, record: name(r.table_name, d), change, reason }
    }
  }, [catalog, people])

  const person = (id: string | null) => {
    const p = people.find((x) => x.id === id)
    return p ? { name: p.full_name, initials: initialsOf(p.full_name), role: p.role_id?.replace(/_/g, ' ') ?? '—' } : { name: id ? 'Former staff' : 'System', initials: id ? '?' : 'SY', role: id ? '' : 'Automatic' }
  }

  const q = query.trim().toLowerCase()
  const entries = rows
    .map(describe)
    .filter((e) => action === 'All actions' || e.action === action)
    .filter((e) => !q || `${e.record} ${e.change} ${e.reason ?? ''}`.toLowerCase().includes(q))

  const columns: Column<Entry>[] = [
    { key: 'when', header: 'When', width: 104, render: (e) => <TextCell tone="primary">{e.when}</TextCell> },
    { key: 'who', header: 'Who', width: 200, render: (e) => <PrimaryCell initials={person(e.whoId).initials} title={person(e.whoId).name} subtitle={<span className="capitalize">{person(e.whoId).role}</span>} /> },
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

  const exportRows = () =>
    downloadCsv(
      'audit-log',
      ['When', 'Who', 'Action', 'Record', 'Change', 'Reason'],
      entries.map((e) => [new Date(e.at).toISOString(), person(e.whoId).name, e.action, e.record, e.change, e.reason]),
    )

  return (
    <>
      <SettingsHeader
        title="Audit log"
        description="Who did what, and when, for every create, edit and delete. Nothing is ever hard-deleted."
        actions={
          <Button leadingIcon={Download} disabled={!entries.length} onClick={exportRows}>
            Export
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Select label="Period" leadingIcon={CalendarDays} width={170} options={PERIODS} value={period} onChange={setPeriod} />
        <Select label="Who" leadingIcon={Users} width={170} options={['Everyone', ...people.map((s) => s.full_name)]} value={who} onChange={setWho} />
        <Select label="Action" leadingIcon={ListFilter} width={170} options={ACTIONS} value={action} onChange={setAction} />
        <span className="flex-1" />
        <SearchInput label="Search records" placeholder="Search records" width={240} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <Card>
        <CardHeader
          title="Changes"
          meta={
            <span className="type-body-sm text-fg-tertiary">
              {state === 'loading' ? 'Loading…' : `Showing ${entries.length} of ${total ?? rows.length} · ${period.toLowerCase()}`}
            </span>
          }
        />
        {typeof state === 'object' ? (
          <p className="px-5 pb-5 type-body-md text-fg-danger">Couldn’t load the audit log: {state.error}</p>
        ) : state === 'loading' ? (
          <p className="px-5 pb-5 type-body-md text-fg-secondary">Loading changes…</p>
        ) : entries.length === 0 ? (
          <p className="px-5 pb-5 type-body-md text-fg-secondary">No changes match these filters.</p>
        ) : (
          <Table columns={columns} rows={entries} rowKey={(e) => String(e.id)} />
        )}
        {total !== null && rows.length < total && state !== 'loading' && (
          <div className="flex justify-center p-4">
            <Button disabled={state === 'more'} onClick={() => void loadMore()}>
              {state === 'more' ? 'Loading…' : `Load ${Math.min(PAGE, total - rows.length)} more`}
            </Button>
          </div>
        )}
      </Card>
      <p className="-mt-2 flex items-center gap-2 type-body-sm text-fg-secondary">
        <History size={16} strokeWidth={1.5} className="shrink-0 text-icon-secondary" />
        Deleted records stay here with their reason, and the owner can restore them. Editing a back-dated sale or purchase recalculates every later balance for that party (BR-1).
      </p>
    </>
  )
}
