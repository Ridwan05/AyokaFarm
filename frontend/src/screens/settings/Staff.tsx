'use client'

import { Plus, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast as sonner } from 'sonner'
import { addStaff, resetStaffPassword, setStaffActive } from '../../app/(app)/settings/staff/actions'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Checkbox, Field, SearchInput, SelectInput, TextInput } from '../../components/ui/Form'
import { RowMenu } from '../../components/ui/Menu'
import { Modal, Presence } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { pens as farmPens } from '../../data/pens'
import { roleToDb } from '../../data/session'
import { useCurrentUser } from '../../data/sessionContext'
import { roleLabels, staff, type StaffMember } from '../../data/settings'
import { useTrade } from '../../data/tradeContext'
import { createClient } from '../../lib/supabase/client'
import { SettingsHeader } from './SettingsHeader'

/** "Pens 3, 4, 5" → [3, 4, 5] */
const penIds = (text: string) => (text.match(/\d+/g) ?? []).map(Number)
const penText = (ids: number[]) => (ids.length === 0 ? 'no pens' : ids.length === 1 ? `Pen ${ids[0]}` : `Pens ${ids.join(', ')}`)

export default function Staff() {
  const toast = useToast()
  const { reload } = useTrade()
  // The owner adds and deactivates staff; the owner and the farm manager assign pens and reset passwords.
  const { id: myId, role: myRole } = useCurrentUser()
  const isOwner = myRole === 'owner'
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [assigning, setAssigning] = useState<StaffMember | null>(null)
  const [resetting, setResetting] = useState<StaffMember | null>(null)
  // `staff` is loaded from Supabase and refreshed after every change.
  const active = staff.filter((p) => p.active)
  const inactive = staff.filter((p) => !p.active)
  const tabs = [`Active · ${active.length}`, `Deactivated · ${inactive.length}`, 'All']
  const [tab, setTab] = useState(tabs[0])
  const key = tab.split(' · ')[0]
  const q = query.trim().toLowerCase()
  const rows = (key === 'Active' ? active : key === 'Deactivated' ? inactive : staff).filter((p) => !q || p.name.toLowerCase().includes(q))

  const setActive = async (p: StaffMember, value: boolean) => {
    const result = await setStaffActive(p.id, value)
    if (!result.ok) return void sonner.error(result.error)
    await reload()
    toast(value ? `${p.name} reactivated` : `${p.name} deactivated and signed out`)
  }

  const columns: Column<StaffMember>[] = [
    { key: 'name', header: 'Name', render: (p) => <PrimaryCell initials={p.initials} title={p.name} subtitle={p.phone} /> },
    { key: 'role', header: 'Role', width: 170, render: (p) => <TextCell tone="primary">{roleLabels[p.role]}</TextCell> },
    { key: 'pens', header: 'Pens', width: 130, render: (p) => <TextCell tone="primary">{p.pens}</TextCell> },
    { key: 'last', header: 'Last active', width: 130, render: (p) => <TextCell tone="primary">{p.lastActive}</TextCell> },
    { key: 'wa', header: 'WhatsApp alerts', width: 130, render: (p) => <TextCell tone="primary">{p.whatsapp ? 'On' : 'Off'}</TextCell> },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      render: (p) => (
        <Badge dot tone={p.active ? 'success' : 'neutral'}>
          {p.active ? 'Active' : 'Deactivated'}
        </Badge>
      ),
    },
  ]

  return (
    <>
      <SettingsHeader
        title="Staff"
        description={`${active.length} people. Each person sees only what their role allows, and everything they record carries their name.`}
        actions={
          isOwner && (
            <Button variant="primary" leadingIcon={Plus} onClick={() => setAdding(true)}>
              Add staff
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Staff status" options={tabs} value={tabs.find((t) => t.startsWith(key))!} onChange={setTab} />
        <span className="flex-1" />
        <SearchInput label="Search staff" placeholder="Search staff" width={240} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <Card>
        <CardHeader title={`${key === 'All' ? 'All' : key} staff`} meta={<span className="type-body-sm text-fg-tertiary">Assigned pens limit what pen attendants see</span>} />
        <Table
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          actionsWidth={56}
          rowActions={(p) => (
            <RowMenu
              items={[
                ...(p.role === 'pen-attendant'
                  ? [{ label: 'Assign pens…', disabled: !p.active, onSelect: () => setAssigning(p) }]
                  : p.role === 'pen-attendant-all'
                    ? [{ label: 'Works on all pens', disabled: true, onSelect: () => {} }]
                    : []),
                { label: 'Reset password…', onSelect: () => setResetting(p), disabled: !p.active || (p.role === 'owner' && !isOwner) },
                ...(isOwner
                  ? [
                      p.active
                        ? { label: 'Deactivate…', danger: true, disabled: p.id === myId, onSelect: () => void setActive(p, false) }
                        : { label: 'Reactivate', onSelect: () => void setActive(p, true) },
                    ]
                  : []),
              ]}
            />
          )}
        />
      </Card>
      <p className="-mt-2 flex items-center gap-2 type-body-sm text-fg-secondary">
        <ShieldCheck size={16} strokeWidth={1.5} className="text-icon-secondary" />
        {isOwner ? 'Deactivating someone signs them out everywhere at once. Their past records keep their name.' : 'Only the owner can add or deactivate staff.'} The owner and farm manager assign pens and reset passwords.
      </p>
      <Presence>{adding && <AddStaffModal onClose={() => setAdding(false)} />}</Presence>
      <Presence>{assigning && <AssignPensModal person={assigning} onClose={() => setAssigning(null)} />}</Presence>
      <Presence>{resetting && <ResetPasswordModal person={resetting} onClose={() => setResetting(null)} />}</Presence>
    </>
  )
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { reload } = useTrade()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<StaffMember['role']>('pen-attendant')
  const [password, setPassword] = useState('')
  const [pens, setPens] = useState<Set<number>>(new Set())
  const [whatsapp, setWhatsapp] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const errors = {
    name: name.trim() ? undefined : 'Enter their name',
    phone: phone.replace(/\D/g, '').length >= 10 ? undefined : 'Enter their phone number',
    password: password.length >= 8 ? undefined : 'At least 8 characters',
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || errors.phone || errors.password) return
    setBusy(true)
    const result = await addStaff({ name, phone, role: roleToDb(role), password, whatsapp, pens: [...pens] })
    setBusy(false)
    if (!result.ok) return void sonner.error(result.error)
    await reload()
    toast(`${name.trim()} can now sign in with their phone number`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a staff member"
      subtitle="They sign in with their phone number and this first password"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-staff" disabled={busy}>
            {busy ? 'Adding…' : 'Add staff member'}
          </Button>
        </>
      }
    >
      <form id="add-staff" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Full name" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Phone" hint="This is their sign-in name" error={submitted ? errors.phone : undefined}>
          {(id) => <TextInput id={id} type="tel" placeholder="0803 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
        <Field label="First password" hint="Give it to them in person; they can't reset it themselves" error={submitted ? errors.password : undefined}>
          {(id) => <TextInput id={id} type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Role" hint={role === 'owner' ? 'Another owner can do everything you can, including adding and removing staff' : 'What they can see and do — see Roles & permissions'}>
          {(id) => (
            <SelectInput
              id={id}
              value={role}
              onChange={(e) => setRole(e.target.value as StaffMember['role'])}
              options={(Object.keys(roleLabels) as StaffMember['role'][]).map((r) => ({ value: r, label: roleLabels[r] }))}
            />
          )}
        </Field>
        {role === 'pen-attendant' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 type-label-md text-fg-primary">Pens</legend>
            <div className="grid grid-cols-2 gap-3">
              {farmPens.map((p) => (
                <Checkbox
                  key={p.id}
                  label={`Pen ${p.id} · ${p.type}`}
                  checked={pens.has(p.id)}
                  onChange={(on) => setPens((s) => (on ? new Set(s).add(p.id) : new Set([...s].filter((x) => x !== p.id))))}
                />
              ))}
            </div>
          </fieldset>
        )}
        <Checkbox label="Send them alerts on WhatsApp" checked={whatsapp} onChange={setWhatsapp} />
      </form>
    </Modal>
  )
}

function AssignPensModal({ person, onClose }: { person: StaffMember; onClose: () => void }) {
  const toast = useToast()
  const { reload } = useTrade()
  const [selected, setSelected] = useState(() => new Set(penIds(person.pens)))
  const [busy, setBusy] = useState(false)
  const toggle = (id: number, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // Row-level security lets the owner and farm manager change pen assignments directly.
  const save = async () => {
    setBusy(true)
    const db = createClient()
    const before = new Set(penIds(person.pens))
    const add = [...selected].filter((id) => !before.has(id))
    const remove = [...before].filter((id) => !selected.has(id))
    const results = await Promise.all([
      add.length ? db.from('staff_pens').insert(add.map((pen_id) => ({ profile_id: person.id, pen_id }))) : null,
      remove.length ? db.from('staff_pens').delete().eq('profile_id', person.id).in('pen_id', remove) : null,
    ])
    setBusy(false)
    const error = results.find((r) => r?.error)?.error
    if (error) return void sonner.error(error.message)
    await reload()
    toast(`${person.name.split(' ')[0]} now works on ${penText([...selected].sort((a, b) => a - b))}`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign pens · ${person.name}`}
      subtitle="They’ll see and record only these pens"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" disabled={busy} onClick={() => void save()}>
            Save pens
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {[...farmPens].sort((a, b) => a.id - b.id).map((p) => (
          <Checkbox key={p.id} label={`Pen ${p.id} · ${p.type}`} checked={selected.has(p.id)} onChange={(on) => toggle(p.id, on)} />
        ))}
      </div>
    </Modal>
  )
}

function ResetPasswordModal({ person, onClose }: { person: StaffMember; onClose: () => void }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return void sonner.error('The new password needs at least 8 characters')
    setBusy(true)
    const result = await resetStaffPassword(person.id, password)
    setBusy(false)
    if (!result.ok) return void sonner.error(result.error)
    toast(`New password set for ${person.name.split(' ')[0]} — give it to them in person`)
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password · ${person.name}`}
      subtitle="Their old password stops working straight away"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="reset-password" disabled={busy}>
            Set new password
          </Button>
        </>
      }
    >
      <form id="reset-password" onSubmit={submit}>
        <Field label="New password" hint="At least 8 characters">
          {(id) => <TextInput id={id} type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  )
}
