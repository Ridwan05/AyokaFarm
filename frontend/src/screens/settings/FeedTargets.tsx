'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field, TextInput } from '../../components/ui/Form'
import { RowMenu } from '../../components/ui/Menu'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Switch } from '../../components/ui/Switch'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { feedBands, feedTypeSettings, thresholds } from '../../data/settings'
import { SettingsHeader } from './SettingsHeader'
import { SectionTitle } from './FarmProfile'

type FeedTypeRow = (typeof feedTypeSettings)[number]
const BREEDS = ['Layers · Isa Brown', 'Broilers · Ross 308'] as const

const typeColumns: Column<FeedTypeRow>[] = [
  { key: 'name', header: 'Name', render: (f) => <TextCell tone="primary">{f.name}</TextCell> },
  { key: 'bag', header: 'Bag weight', align: 'right', width: 120, render: (f) => <NumberCell>{f.bagKg} kg</NumberCell> },
  { key: 'reorder', header: 'Reorder at', align: 'right', width: 130, render: (f) => <NumberCell>{f.reorderAt} bags</NumberCell> },
  { key: 'usedBy', header: 'Used by', width: 200, render: (f) => <TextCell>{f.usedBy}</TextCell> },
  {
    key: 'status',
    header: 'Status',
    width: 120,
    render: (f) => (
      <Badge dot tone={f.active ? 'success' : 'neutral'}>
        {f.active ? 'Active' : 'Inactive'}
      </Badge>
    ),
  },
]

export default function FeedTargets() {
  const toast = useToast()
  const [breed, setBreed] = useState<(typeof BREEDS)[number]>(BREEDS[0])
  const [whatsapp, setWhatsapp] = useState(true)
  const [summary, setSummary] = useState(true)
  const bands = feedBands[breed]

  return (
    <>
      <SettingsHeader sample
        title="Feed & targets"
        description="The numbers behind every Auto field and alert. Only an Admin can change them, and every change is logged."
        actions={
          <Button variant="primary" onClick={() => toast('Feed & targets saved')}>
            Save changes
          </Button>
        }
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1 gap-4 p-5">
          <SectionTitle title="Expected feed by age" note="g per bird per day" />
          <div className="self-start">
            <SegmentedControl label="Breed" options={BREEDS} value={breed} onChange={setBreed} />
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['From week', 'To week', 'Feed', 'Feed type', ''].map((h, i) => (
                    <th key={i} className={`h-10 border-b border-line px-6 type-overline text-fg-tertiary ${i < 3 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr key={b.from} className="border-b border-line-subtle last:border-b-0">
                    <td className="h-14 px-6 text-right type-numeric-md text-fg-primary">{b.from}</td>
                    <td className="px-6 text-right type-numeric-md text-fg-primary">{b.to ?? 'and over'}</td>
                    <td className="px-6 text-right type-numeric-md text-fg-primary">{b.grams} g</td>
                    <td className="px-6 type-body-md text-fg-secondary">{b.feed}</td>
                    <td className="w-14 pr-3 text-right">
                      <RowMenu items={[{ label: 'Edit band', onSelect: () => toast('Editing bands is coming next') }, { label: 'Remove band', danger: true, onSelect: () => toast('A band can’t leave a gap — edit its neighbour first') }]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4">
            <p className="flex-1 type-body-sm text-fg-secondary">One value per band, and bands can’t overlap. Each pen entry uses the band for its flock’s age (probe C4).</p>
            <Button variant="ghost" leadingIcon={Plus}>
              Add band
            </Button>
          </div>
        </Card>
        <Card className="w-full shrink-0 lg:w-[380px] gap-4 p-5">
          <SectionTitle title="Alert thresholds" note="When alerts fire" />
          {thresholds.map((t) => (
            <Field key={t.key} label={t.label} className="-mt-1">
              {(id) => <TextInput id={id} size="md" defaultValue={t.value} suffix={t.suffix} />}
            </Field>
          ))}
          <Switch label="Send alerts on WhatsApp" checked={whatsapp} onChange={setWhatsapp} />
          <Switch label="Evening summary to Admin at 19:00" checked={summary} onChange={setSummary} />
        </Card>
      </div>
      <Card>
        <CardHeader title="Feed types" meta={<span className="type-body-sm text-fg-tertiary">Bag weight drives every kg figure (probe C1)</span>} action={{ label: 'Add feed type', onClick: () => toast('Adding feed types is coming next') }} />
        <Table columns={typeColumns} rows={feedTypeSettings} rowKey={(f) => f.name} actionsWidth={56} rowActions={() => <RowMenu items={[{ label: 'Edit', onSelect: () => toast('Editing feed types is coming next') }]} />} />
      </Card>
    </>
  )
}
