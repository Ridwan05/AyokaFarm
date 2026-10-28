'use client'

import { Plus, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Checkbox, Field, SearchInput, SelectInput, TextInput } from '../../components/ui/Form'
import { RowMenu } from '../../components/ui/Menu'
import { Modal, Presence } from '../../components/ui/Overlay'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { roleLabels, staff as initialStaff, type StaffMember } from '../../data/settings'
import { SettingsHeader } from './SettingsHeader'

export default function Staff() {
  const toast = useToast()
  const [people, setPeople] = useState(initialStaff)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const active = people.filter((p) => p.active)
  const inactive = people.filter((p) => !p.active)
  const tabs = [`Active · ${active.length}`, `Deactivated · ${inactive.length}`, 'All']
  const [tab, setTab] = useState(tabs[0])
  const key = tab.split(' · ')[0]
  const q = query.trim().toLowerCase()
  const rows = (key === 'Active' ? active : key === 'Deactivated' ? inactive : people).filter((p) => !q || p.name.toLowerCase().includes(q))

  const setActive = (id: string, value: boolean) => setPeople((list) => list.map((p) => (p.id === id ? { ...p, active: value } : p)))

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
          <Button variant="primary" leadingIcon={Plus} onClick={() => setAdding(true)}>
            Add staff
          </Button>
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
                { label: 'Reset password', onSelect: () => toast(`Reset link sent to ${p.name.split(' ')[0]} on WhatsApp`), disabled: !p.active },
                p.active
                  ? { label: 'Deactivate…', danger: true, disabled: p.role === 'owner', onSelect: () => (setActive(p.id, false), toast(`${p.name} deactivated and signed out`)) }
                  : { label: 'Reactivate', onSelect: () => (setActive(p.id, true), toast(`${p.name} reactivated`)) },
              ]}
            />
          )}
        />
      </Card>
      <p className="-mt-2 flex items-center gap-2 type-body-sm text-fg-secondary">
        <ShieldCheck size={16} strokeWidth={1.5} className="text-icon-secondary" />
        Deactivating someone signs them out everywhere at once. Their past records keep their name. Admin and the farm manager can reset passwords.
      </p>
      <Presence>{adding && <AddStaffModal onClose={() => setAdding(false)} onSave={(p) => setPeople((list) => [...list, p])} />}</Presence>
    </>
  )
}

function AddStaffModal({ onClose, onSave }: { onClose: () => void; onSave: (p: StaffMember) => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<StaffMember['role']>('pen-attendant')
  const [pens, setPens] = useState('')
  const [whatsapp, setWhatsapp] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const errors = { name: name.trim() ? undefined : 'Enter their name', phone: phone.replace(/\D/g, '').length >= 10 ? undefined : 'Enter their phone number' }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || errors.phone) return
    const digits = phone.replace(/\D/g, '')
    const trimmed = name.trim()
    onSave({
      id: trimmed.toLowerCase().replace(/\s+/g, '-'),
      name: trimmed,
      initials: trimmed.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
      phone: `${digits.slice(0, 4)} ••• ${digits.slice(-4)}`,
      role,
      pens: role === 'pen-attendant' ? pens || '—' : role === 'farm-manager' ? 'All pens' : '—',
      lastActive: 'Invited',
      whatsapp,
      active: true,
    })
    toast(`${trimmed} invited — they’ll get a sign-in link on WhatsApp`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a staff member"
      subtitle="They sign in with their phone number"
      footer={
        <>
          <Button size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" variant="primary" className="flex-1" type="submit" form="add-staff">
            Send invite
          </Button>
        </>
      }
    >
      <form id="add-staff" onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Full name" error={submitted ? errors.name : undefined}>
          {(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Phone" error={submitted ? errors.phone : undefined}>
          {(id) => <TextInput id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
        <Field label="Role" hint="What they can see and do — see Roles & permissions">
          {(id) => (
            <SelectInput
              id={id}
              value={role}
              onChange={(e) => setRole(e.target.value as StaffMember['role'])}
              options={(Object.keys(roleLabels) as StaffMember['role'][]).filter((r) => r !== 'owner').map((r) => ({ value: r, label: roleLabels[r] }))}
            />
          )}
        </Field>
        {role === 'pen-attendant' && (
          <Field label="Pens" hint="They’ll only see these pens">
            {(id) => <TextInput id={id} placeholder="Pen 7" value={pens} onChange={(e) => setPens(e.target.value)} />}
          </Field>
        )}
        <Checkbox label="Send them alerts on WhatsApp" checked={whatsapp} onChange={setWhatsapp} />
      </form>
    </Modal>
  )
}
