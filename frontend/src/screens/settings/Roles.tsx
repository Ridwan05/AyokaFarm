'use client'

import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, SelectInput } from '../../components/ui/Form'
import { useToast } from '../../components/ui/toastContext'
import { EDIT_WINDOWS, LATE_ENTRIES, modules, roles as initialRoles, staff, type Module, type Permission, type Tick } from '../../data/settings'
import { cn } from '../../lib/cn'
import { SettingsHeader } from './SettingsHeader'

const ACTIONS = ['view', 'add', 'edit', 'delete'] as const

export default function Roles() {
  const toast = useToast()
  const [roles, setRoles] = useState(initialRoles)
  const [selected, setSelected] = useState('pen-attendant')
  const [editWindow, setEditWindow] = useState<string>(EDIT_WINDOWS[0])
  const [late, setLate] = useState<string>(LATE_ENTRIES[0])
  const role = roles.find((r) => r.id === selected)!
  const members = staff.filter((s) => s.active && s.role === role.id)
  const locked = role.id === 'owner'

  const toggle = (m: Module, a: (typeof ACTIONS)[number]) =>
    setRoles((list) =>
      list.map((r) => {
        if (r.id !== selected) return r
        const p: Permission = { ...r.permissions[m], [a]: !r.permissions[m][a] }
        if (!p.view && !p.add && !p.edit && !p.delete) p.scope = 'Hidden'
        else if (p.scope === 'Hidden') p.scope = 'All records'
        return { ...r, permissions: { ...r.permissions, [m]: p } }
      }),
    )

  return (
    <>
      <SettingsHeader sample
        title="Roles & permissions"
        description="Tick what each role can view, add, edit and delete. Menus follow these ticks, and the server enforces them."
        actions={
          <Button variant="primary" leadingIcon={Plus} onClick={() => toast('Copy an existing role to start a new one')}>
            New role
          </Button>
        }
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="w-full shrink-0 lg:w-[300px] gap-1 p-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Roles</h2>
            <span className="type-body-sm text-fg-tertiary">{roles.length}</span>
          </div>
          {roles.map((r) => {
            const n = staff.filter((s) => s.active && s.role === r.id).length
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                className={cn('flex cursor-pointer items-center rounded-md px-3 py-2.5 text-left', r.id === selected ? 'bg-subtle' : 'hover:bg-canvas')}
              >
                <span className="flex flex-1 flex-col">
                  <span className="type-body-md text-fg-primary">{r.name}</span>
                  <span className="type-body-sm text-fg-tertiary">
                    {n} {n === 1 ? 'person' : 'people'}
                  </span>
                </span>
                <ChevronRight size={16} strokeWidth={1.5} className="text-icon-secondary" />
              </button>
            )
          })}
          <p className="pt-2 type-body-sm text-fg-secondary">All five are the defaults from the BRD. Copy one to make a custom role.</p>
        </Card>

        <Card className="min-w-0 flex-1 gap-4 p-5">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="type-h3 text-fg-primary">{role.name}</h2>
              <span className="type-body-sm text-fg-tertiary">
                {members.length} {members.length === 1 ? 'person' : 'people'} · {members.map((m) => m.name.split(' ')[0]).join(', ')}
              </span>
            </div>
            <p className="pt-1 type-body-md text-fg-secondary">{role.description}</p>
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full border-collapse">
              <thead className="bg-canvas">
                <tr>
                  <th className="h-10 px-4 text-left type-overline text-fg-tertiary">Module</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="h-10 w-16 text-center type-overline text-fg-tertiary">
                      {a}
                    </th>
                  ))}
                  <th className="h-10 w-[200px] px-4 text-left type-overline text-fg-tertiary">Scope</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => {
                  const p = role.permissions[m]
                  const hidden = p.scope === 'Hidden'
                  return (
                    <tr key={m} className="border-t border-line-subtle">
                      <td className={cn('h-11 px-4 type-body-md', hidden ? 'text-fg-secondary' : 'text-fg-primary')}>{m}</td>
                      {ACTIONS.map((a) => (
                        <td key={a} className="text-center">
                          <TickBox value={p[a]} disabled={locked} label={`${role.name} can ${a} ${m}`} onToggle={() => toggle(m, a)} />
                        </td>
                      ))}
                      <td className="px-4 type-body-sm text-fg-secondary">{p.scope}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {(role.id === 'pen-attendant' || role.id === 'pen-attendant-all') && (
            <div className="flex flex-col gap-4 sm:flex-row">
              <Field label="Edit window" hint="Own records only" className="flex-1">
                {(id) => <SelectInput id={id} size="md" value={editWindow} onChange={(e) => setEditWindow(e.target.value)} options={EDIT_WINDOWS.map((v) => ({ value: v, label: v }))} />}
              </Field>
              <Field label="Late entries" hint="Older corrections: farm manager, with a reason" className="flex-1">
                {(id) => <SelectInput id={id} size="md" value={late} onChange={(e) => setLate(e.target.value)} options={LATE_ENTRIES.map((v) => ({ value: v, label: v }))} />}
              </Field>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="flex-1 type-body-sm text-fg-secondary">
              {locked ? 'Admin always has every permission.' : 'Changes apply at each person’s next sign-in and are logged in the audit log.'}
            </span>
            <Button onClick={() => setRoles(initialRoles)}>Cancel</Button>
            <Button variant="primary" disabled={locked} onClick={() => toast(`${role.name} permissions saved`)}>
              Save changes
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}

function TickBox({ value, disabled, label, onToggle }: { value: Tick; disabled: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={value === 'partial' ? 'mixed' : value}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'inline-flex size-5 cursor-pointer items-center justify-center rounded-xs border disabled:cursor-not-allowed',
        value ? 'border-brand bg-brand text-fg-on-brand' : 'border-line-strong bg-surface',
      )}
    >
      {value === true && (
        <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {value === 'partial' && <span className="h-0.5 w-2.5 rounded-full bg-current" />}
    </button>
  )
}
