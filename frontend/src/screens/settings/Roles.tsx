'use client'

import { ChevronRight, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, SelectInput, TextInput } from '../../components/ui/Form'
import { Modal, Presence } from '../../components/ui/Overlay'
import type { AccessLevel, AppModule } from '../../data/session'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { canEditSettings, modules } from '../../lib/access'
import { cn } from '../../lib/cn'
import { createClient } from '../../lib/supabase/client'
import type { Tables } from '../../lib/supabase/database.types'
import { SettingsHeader } from './SettingsHeader'

const ACTIONS = ['view', 'add', 'edit', 'delete'] as const
type Action = (typeof ACTIONS)[number]
type Perm = Record<Action, AccessLevel> & { scope: string }
type RoleRow = Tables<'roles'> & { permissions: Record<AppModule, Perm> }

const NEXT: Record<AccessLevel, AccessLevel> = { none: 'own', own: 'all', all: 'none' }
const LEVEL_LABEL: Record<AccessLevel, string> = { none: 'None', own: 'Own', all: 'All' }
const HIDDEN: Perm = { view: 'none', add: 'none', edit: 'none', delete: 'none', scope: 'Hidden' }

// Non-managers can change their own records for this many days (farm_settings.edit_window_days).
const EDIT_WINDOWS = [
  { value: '0', label: 'Until 23:59 the same day' },
  { value: '1', label: 'Until 23:59 the next day' },
  { value: '2', label: 'Up to 2 days after' },
  { value: '7', label: 'Up to a week after' },
]

const isHidden = (p: Perm) => ACTIONS.every((a) => p[a] === 'none')

async function loadRoles(): Promise<RoleRow[]> {
  const db = createClient()
  const [{ data: roles, error }, { data: perms, error: permsError }] = await Promise.all([
    db.from('roles').select('*').order('created_at').order('id'),
    db.from('role_permissions').select('*'),
  ])
  if (error || permsError) throw new Error((error ?? permsError)!.message)
  return (roles ?? []).map((r) => ({
    ...r,
    permissions: Object.fromEntries(
      modules.map((m) => {
        const p = perms?.find((x) => x.role_id === r.id && x.module === m.id)
        return [m.id, p ? { view: p.can_view, add: p.can_add, edit: p.can_edit, delete: p.can_delete, scope: p.scope_note } : HIDDEN]
      }),
    ) as Record<AppModule, Perm>,
  }))
}

export default function Roles() {
  const user = useCurrentUser()
  const { catalog, settings, reload } = useTrade()
  const editable = canEditSettings(user)
  const [saved, setSaved] = useState<RoleRow[] | null>(null)
  const [roles, setRoles] = useState<RoleRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState('pen_attendant')
  const [editWindow, setEditWindow] = useState(String(settings?.edit_window_days ?? 0))
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const list = await loadRoles()
      setSaved(list)
      setRoles(list)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    // Roles load on demand from Supabase (an external system), so setting state here is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  const header = (
    <SettingsHeader
      title="Roles & permissions"
      description="Set what each role can view, add, edit and delete: None, Own (their pens or records) or All. Menus follow these, and the server enforces them."
      actions={
        editable && roles && (
          <Button variant="primary" leadingIcon={Plus} onClick={() => setAdding(true)}>
            New role
          </Button>
        )
      }
    />
  )
  if (!roles || !saved) {
    return (
      <>
        {header}
        <Card className="items-center gap-3 p-10 text-center type-body-md text-fg-secondary">
          {loadError ? (
            <>
              <span>Couldn’t load roles: {loadError}</span>
              <Button onClick={() => void refresh()}>Try again</Button>
            </>
          ) : (
            'Loading roles…'
          )}
        </Card>
      </>
    )
  }

  const role = roles.find((r) => r.id === selected) ?? roles[0]
  const before = saved.find((r) => r.id === role.id)
  const members = catalog.profiles.filter((p) => p.is_active && p.role_id === role.id)
  // The owner role always keeps everything, so nobody can lock the farm out of Settings.
  const locked = role.id === 'owner' || !editable
  const changedModules = modules.filter((m) => JSON.stringify(role.permissions[m.id]) !== JSON.stringify(before?.permissions[m.id]))
  const windowChanged = editWindow !== String(settings?.edit_window_days ?? 0)
  const dirty = changedModules.length > 0 || windowChanged
  const showsWindow = role.permissions.production.edit === 'own' || role.id.startsWith('pen_attendant')

  const update = (m: AppModule, change: (p: Perm) => Perm) =>
    setRoles((list) => list!.map((r) => (r.id === role.id ? { ...r, permissions: { ...r.permissions, [m]: change(r.permissions[m]) } } : r)))

  const cycle = (m: AppModule, a: Action) =>
    update(m, (p) => {
      const next: Perm = { ...p, [a]: NEXT[p[a]] }
      // Adding, editing or deleting needs at least view; hiding a module clears the rest.
      if (a !== 'view' && next[a] !== 'none' && next.view === 'none') next.view = next[a]
      if (a === 'view' && next.view === 'none') ACTIONS.forEach((x) => (next[x] = 'none'))
      if (isHidden(next)) next.scope = 'Hidden'
      else if (p.scope === 'Hidden') next.scope = next.view === 'own' ? 'Own records' : 'All records'
      return next
    })

  async function save() {
    setSaving(true)
    const db = createClient()
    if (changedModules.length) {
      const { error } = await db.from('role_permissions').upsert(
        changedModules.map((m) => {
          const p = role.permissions[m.id]
          return { role_id: role.id, module: m.id, can_view: p.view, can_add: p.add, can_edit: p.edit, can_delete: p.delete, scope_note: p.scope.trim() || (isHidden(p) ? 'Hidden' : '') }
        }),
        { onConflict: 'role_id,module' },
      )
      if (error) {
        setSaving(false)
        return toast.error(/row-level security|permission/i.test(error.message) ? 'Only the owner can change permissions.' : error.message)
      }
    }
    if (windowChanged) {
      const { error } = await db.from('farm_settings').update({ edit_window_days: Number(editWindow) }).eq('id', true)
      if (error) {
        setSaving(false)
        return toast.error(error.message)
      }
      await reload()
    }
    setSaving(false)
    toast.success(`${role.name} saved`, { description: 'Applies the next time each person opens the app.' })
    await refresh()
  }

  return (
    <>
      {header}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="w-full shrink-0 lg:w-[300px] gap-1 p-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Roles</h2>
            <span className="type-body-sm text-fg-tertiary">{roles.length}</span>
          </div>
          {roles.map((r) => {
            const n = catalog.profiles.filter((p) => p.is_active && p.role_id === r.id).length
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                className={cn('flex cursor-pointer items-center rounded-md px-3 py-2.5 text-left', r.id === role.id ? 'bg-subtle' : 'hover:bg-canvas')}
              >
                <span className="flex flex-1 flex-col">
                  <span className="type-body-md text-fg-primary">{r.name}</span>
                  <span className="type-body-sm text-fg-tertiary">
                    {n} {n === 1 ? 'person' : 'people'}
                    {!r.is_system && ' · custom'}
                  </span>
                </span>
                <ChevronRight size={16} strokeWidth={1.5} className="text-icon-secondary" />
              </button>
            )
          })}
          <p className="pt-2 type-body-sm text-fg-secondary">The built-in roles come from the BRD. A new role starts as a copy of another.</p>
        </Card>

        <Card className="min-w-0 flex-1 gap-4 p-5">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="type-h3 text-fg-primary">{role.name}</h2>
              <span className="type-body-sm text-fg-tertiary">
                {members.length} {members.length === 1 ? 'person' : 'people'}
                {members.length > 0 && ` · ${members.map((m) => m.full_name.split(' ')[0]).join(', ')}`}
              </span>
            </div>
            <p className="pt-1 type-body-md text-fg-secondary">{role.description}</p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="bg-canvas">
                <tr>
                  <th className="h-10 px-4 text-left type-overline text-fg-tertiary">Module</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="h-10 w-16 text-center type-overline text-fg-tertiary">
                      {a}
                    </th>
                  ))}
                  <th className="h-10 w-[220px] px-4 text-left type-overline text-fg-tertiary">Scope</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => {
                  const p = role.permissions[m.id]
                  const hidden = isHidden(p)
                  return (
                    <tr key={m.id} className="border-t border-line-subtle">
                      <td className={cn('h-11 px-4 type-body-md', hidden ? 'text-fg-secondary' : 'text-fg-primary')}>{m.label}</td>
                      {ACTIONS.map((a) => (
                        <td key={a} className="text-center">
                          <LevelButton value={p[a]} disabled={locked} label={`${role.name} can ${a} ${m.label}`} onCycle={() => cycle(m.id, a)} />
                        </td>
                      ))}
                      <td className="px-3">
                        {locked || hidden ? (
                          <span className="px-1 type-body-sm text-fg-secondary">{p.scope}</span>
                        ) : (
                          <TextInput size="md" aria-label={`Scope note for ${m.label}`} value={p.scope} onChange={(e) => update(m.id, (x) => ({ ...x, scope: e.target.value }))} />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {showsWindow && (
            <Field label="Edit window" hint="Applies to everyone who isn’t a manager, for their own records. Older corrections: the farm manager, with a reason." className="sm:max-w-[360px]">
              {(id) => <SelectInput id={id} size="md" disabled={!editable} value={editWindow} onChange={(e) => setEditWindow(e.target.value)} options={EDIT_WINDOWS} />}
            </Field>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="flex-1 type-body-sm text-fg-secondary">
              {role.id === 'owner'
                ? 'The owner role always has every permission, so nobody can be locked out of Settings.'
                : !editable
                  ? 'Only the owner can change permissions.'
                  : 'Click a cell to cycle None → Own → All. Changes are logged in the audit log.'}
            </span>
            {editable && role.id !== 'owner' && (
              <div className="flex gap-2">
                <Button
                  disabled={!dirty || saving}
                  onClick={() => {
                    setRoles(saved)
                    setEditWindow(String(settings?.edit_window_days ?? 0))
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
      <Presence>
        {adding && (
          <NewRoleModal
            roles={saved}
            onClose={() => setAdding(false)}
            onCreated={async (id) => {
              setAdding(false)
              await refresh()
              setSelected(id)
            }}
          />
        )}
      </Presence>
    </>
  )
}

function LevelButton({ value, disabled, label, onCycle }: { value: AccessLevel; disabled: boolean; label: string; onCycle: () => void }) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${LEVEL_LABEL[value]}`}
      title={disabled ? undefined : 'Click to change'}
      disabled={disabled}
      onClick={onCycle}
      className={cn(
        'inline-flex h-7 min-w-11 cursor-pointer items-center justify-center rounded-sm border px-2 type-label-sm transition-transform duration-150 ease-out active:scale-[0.97] disabled:cursor-default',
        value === 'all' && 'border-brand bg-brand text-fg-on-brand',
        value === 'own' && 'border-brand bg-surface text-fg-brand',
        value === 'none' && 'border-line bg-surface text-fg-tertiary',
      )}
    >
      {value === 'none' ? '—' : LEVEL_LABEL[value]}
    </button>
  )
}

function NewRoleModal({ roles, onClose, onCreated }: { roles: RoleRow[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [copyFrom, setCopyFrom] = useState(roles.find((r) => r.id === 'pen_attendant')?.id ?? roles[0].id)
  const [busy, setBusy] = useState(false)
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'r_$1')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!id) return toast.error('Give the role a name')
    if (roles.some((r) => r.id === id || r.name.toLowerCase() === name.trim().toLowerCase())) return toast.error('A role with that name already exists')
    setBusy(true)
    const db = createClient()
    const source = roles.find((r) => r.id === copyFrom)!
    const { error } = await db.from('roles').insert({ id, name: name.trim(), description: description.trim() || `Based on ${source.name}.` })
    if (!error) {
      const { error: permsError } = await db.from('role_permissions').insert(
        modules.map((m) => {
          const p = source.permissions[m.id]
          return { role_id: id, module: m.id, can_view: p.view, can_add: p.add, can_edit: p.edit, can_delete: p.delete, scope_note: p.scope }
        }),
      )
      if (permsError) {
        setBusy(false)
        return toast.error(permsError.message)
      }
    }
    setBusy(false)
    if (error) return toast.error(/row-level security|permission/i.test(error.message) ? 'Only the owner can add roles.' : error.message)
    toast.success(`${name.trim()} created`, { description: `Copied from ${source.name}. Adjust its permissions, then give it to someone in Staff.` })
    onCreated(id)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New role"
      subtitle="Starts as a copy of another role's permissions"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="new-role" disabled={busy}>
            {busy ? 'Creating…' : 'Create role'}
          </Button>
        </>
      }
    >
      <form id="new-role" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Role name">{(fid) => <TextInput id={fid} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Night supervisor" />}</Field>
        <Field label="What they do" hint="Shown on this page">
          {(fid) => <TextInput id={fid} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Copy permissions from">
          {(fid) => <SelectInput id={fid} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} options={roles.filter((r) => r.id !== 'owner').map((r) => ({ value: r.id, label: r.name }))} />}
        </Field>
      </form>
    </Modal>
  )
}
