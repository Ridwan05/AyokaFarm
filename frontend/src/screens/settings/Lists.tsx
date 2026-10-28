'use client'

import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, SelectInput } from '../../components/ui/Form'
import { RowMenu } from '../../components/ui/Menu'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { lists, priceList } from '../../data/settings'
import { cn } from '../../lib/cn'
import { formatNaira } from '../../lib/format'
import { SettingsHeader } from './SettingsHeader'

type Price = (typeof priceList)[number]

const priceColumns: Column<Price>[] = [
  { key: 'name', header: 'Product', render: (p) => <TextCell tone="primary">{p.name}</TextCell> },
  { key: 'unit', header: 'Unit', align: 'right', width: 90, render: (p) => <TextCell tone="primary">{p.unit}</TextCell> },
  { key: 'min', header: 'Minimum price', align: 'right', width: 130, render: (p) => <NumberCell>{formatNaira(p.minimum)}</NumberCell> },
  { key: 'last', header: 'Last price', width: 140, render: (p) => <TextCell>{p.last}</TextCell> },
  {
    key: 'status',
    header: 'Status',
    width: 100,
    render: (p) => (
      <Badge dot tone={p.active ? 'success' : 'neutral'}>
        {p.active ? 'Active' : 'Hidden'}
      </Badge>
    ),
  },
]

export default function Lists() {
  const toast = useToast()
  const [selected, setSelected] = useState(lists[0].id)
  const [approver, setApprover] = useState('Farm Manager or Owner')
  const [showMin, setShowMin] = useState('Yes, on the sale form')
  const list = lists.find((l) => l.id === selected)!

  return (
    <>
      <SettingsHeader sample
        title="Lists"
        description="The pick-lists every form uses. Change one here and every phone gets the new list at its next sign-in."
        actions={
          <Button variant="primary" leadingIcon={Plus} onClick={() => toast('New lists are coming next')}>
            New list
          </Button>
        }
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="w-full shrink-0 lg:w-[300px] gap-1 p-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Lists</h2>
            <span className="type-body-sm text-fg-tertiary">{lists.length}</span>
          </div>
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSelected(l.id)}
              className={cn('flex cursor-pointer items-center rounded-md px-3 py-2.5 text-left', l.id === selected ? 'bg-subtle' : 'hover:bg-canvas')}
            >
              <span className="flex flex-1 flex-col">
                <span className="type-body-md text-fg-primary">{l.name}</span>
                <span className="type-body-sm text-fg-tertiary">{l.id === 'products' ? `${priceList.length} products` : l.summary}</span>
              </span>
              <ChevronRight size={16} strokeWidth={1.5} className="text-icon-secondary" />
            </button>
          ))}
          <p className="pt-2 type-body-sm text-fg-secondary">Removing an item hides it from new forms; old records keep it.</p>
        </Card>

        <Card className="min-w-0 flex-1 gap-4 p-5">
          <div className="flex items-baseline gap-2">
            <h2 className="type-h3 text-fg-primary">{list.name}</h2>
            <span className="type-body-sm text-fg-tertiary">{list.id === 'products' ? `${priceList.length} products · used by Record sale` : list.summary}</span>
          </div>
          {list.id === 'products' ? (
            <>
              <p className="type-body-md text-fg-secondary">
                Selling under the minimum waits for Emeka’s or Adeola’s approval (FR-SAL-5). New prices apply to new sales only — old receipts keep theirs.
              </p>
              <Table columns={priceColumns} rows={priceList} rowKey={(p) => p.name} actionsWidth={48} rowActions={(p) => <RowMenu items={[{ label: 'Change minimum', onSelect: () => toast(`Editing ${p.name}`) }, { label: 'Hide from new sales', danger: true, onSelect: () => toast(`${p.name} hidden`) }]} />} />
              <div className="flex flex-col gap-4 sm:flex-row">
                <Field label="Who approves below-minimum sales" hint="Funmi can still save the sale as Pending" className="flex-1">
                  {(id) => <SelectInput id={id} size="md" value={approver} onChange={(e) => setApprover(e.target.value)} options={['Farm Manager or Owner', 'Owner only'].map((v) => ({ value: v, label: v }))} />}
                </Field>
                <Field label="Show the minimum to sales staff" hint="So the price isn’t a surprise at the gate" className="flex-1">
                  {(id) => <SelectInput id={id} size="md" value={showMin} onChange={(e) => setShowMin(e.target.value)} options={['Yes, on the sale form', 'No'].map((v) => ({ value: v, label: v }))} />}
                </Field>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-1 type-body-sm text-fg-secondary">Price changes are logged in the audit log with your name.</span>
                <Button>Cancel</Button>
                <Button variant="primary" onClick={() => toast('Prices saved')}>
                  Save changes
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="type-body-md text-fg-secondary">{list.description}</p>
              <ul className="flex flex-col">
                {list.items.map((item) => (
                  <li key={item.name} className="flex h-12 items-center border-b border-line-subtle last:border-b-0">
                    <span className="flex-1 type-body-md text-fg-primary">{item.name}</span>
                    {item.detail && <span className="pr-4 type-body-sm text-fg-tertiary">{item.detail}</span>}
                    <RowMenu items={[{ label: 'Rename', onSelect: () => toast(`Renaming ${item.name}`) }, { label: 'Hide from new forms', danger: true, onSelect: () => toast(`${item.name} hidden from new forms`) }]} />
                  </li>
                ))}
              </ul>
              <Button variant="ghost" leadingIcon={Plus} className="self-start">
                Add item
              </Button>
            </>
          )}
        </Card>
      </div>
    </>
  )
}
