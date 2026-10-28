'use client'

import { Bird, ChevronRight, Egg, ListFilter, Plus } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../components/ui/Table'
import { AddPenModal } from '../features/pens/AddPenModal'
import { PlaceFlockDrawer } from '../features/pens/PlaceFlockDrawer'
import { closedFlocks, pens, type ClosedFlock, type Pen, type Stat } from '../data/pens'
import { cn } from '../lib/cn'
import { formatNaira, formatNumber } from '../lib/format'
import { Presence } from '../components/ui/Overlay'

const SORTS = ['Needs attention first', 'Pen number', 'Most birds'] as const

const sorters: Record<(typeof SORTS)[number], (a: Pen, b: Pen) => number> = {
  'Needs attention first': (a, b) => a.attention - b.attention,
  'Pen number': (a, b) => a.id - b.id,
  'Most birds': (a, b) => b.liveBirds - a.liveBirds,
}

export default function Pens() {
  const layers = pens.filter((p) => p.type === 'Layers').length
  const broilers = pens.length - layers
  const liveBirds = pens.reduce((n, p) => n + p.liveBirds, 0)

  const tabs = [`All · ${pens.length}`, `Layers · ${layers}`, `Broilers · ${broilers}`]
  const [tab, setTab] = useState(tabs[0])
  const [sort, setSort] = useState<(typeof SORTS)[number]>(SORTS[0])
  const [overlay, setOverlay] = useState<'add-pen' | 'place-flock' | null>(null)
  const close = () => setOverlay(null)

  const typeFilter = tab.split(' · ')[0]
  const visible = pens
    .filter((p) => typeFilter === 'All' || p.type === typeFilter)
    .sort(sorters[sort])

  return (
    <>
      <PageHeader
        eyebrow={['Operate', 'Pens & flocks']}
        title="Pens & flocks"
        description={`${pens.length} pens · ${formatNumber(liveBirds)} live birds · ${layers} layer flocks and ${broilers} broiler flocks. Sorted by what needs attention.`}
        actions={
          <>
            <Button leadingIcon={Plus} onClick={() => setOverlay('add-pen')}>
              Add pen
            </Button>
            <Button variant="primary" leadingIcon={Bird} onClick={() => setOverlay('place-flock')}>
              Place new flock
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Bird type" options={tabs} value={tab} onChange={setTab} />
        <span className="flex-1" />
        <Select label="Sort pens" leadingIcon={ListFilter} width={240} options={SORTS} value={sort} onChange={setSort} />
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-6">
        {visible.map((pen) => (
          <PenTile key={pen.id} pen={pen} />
        ))}
      </div>

      <Card>
        <CardHeader
          title="Closed flocks"
          meta={<span className="type-body-sm text-fg-tertiary">Profit is judged per flock, over its whole life</span>}
          action={{ label: 'All flocks', to: '/pens/flocks' }}
        />
        <Table columns={flockColumns} rows={closedFlocks} rowKey={(f) => f.code} />
      </Card>

      {/* Mounted only while open so each opening starts with a fresh form. */}
      <Presence>{overlay === 'add-pen' && <AddPenModal open onClose={close} />}</Presence>
      <Presence>{overlay === 'place-flock' && <PlaceFlockDrawer open onClose={close} />}</Presence>
    </>
  )
}

const statTone = { default: 'text-fg-primary', warning: 'text-fg-warning', danger: 'text-fg-danger' }

function PenTile({ pen }: { pen: Pen }) {
  const Icon = pen.type === 'Layers' ? Egg : Bird
  const fill = Math.min(pen.liveBirds / pen.capacity, 1) * 100
  return (
    <Link
      href={`/pens/${pen.id}`}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-5 pt-5 pb-4 transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-icon-brand">
          <Icon size={20} strokeWidth={1.5} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate type-label-lg text-fg-primary">
            Pen {pen.id} · {pen.type}
          </span>
          <span className="truncate type-body-sm text-fg-tertiary">
            {pen.flock} · week {pen.week}
          </span>
        </div>
        <Badge tone={pen.status.tone} dot>
          {pen.status.label}
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center">
          <span className="flex-1 type-body-sm text-fg-secondary">Live birds</span>
          <span className="type-numeric-md text-fg-primary">
            {formatNumber(pen.liveBirds)} / {formatNumber(pen.capacity)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-subtle">
          <div className="h-1.5 rounded-full bg-chart-1" style={{ width: `${fill}%` }} />
        </div>
      </div>

      <div className="flex gap-3">
        {pen.stats.map((stat) => (
          <StatBlock key={stat.label} stat={stat} />
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-line-subtle pt-3">
        <span className="flex-1 truncate type-body-sm text-fg-tertiary">{pen.footer}</span>
        <ChevronRight size={16} strokeWidth={1.5} className="text-icon-secondary" />
      </div>
    </Link>
  )
}

function StatBlock({ stat }: { stat: Stat }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate type-overline text-fg-tertiary">{stat.label}</span>
      <span
        className={cn(
          'type-numeric-md',
          stat.value === null ? 'text-fg-tertiary' : statTone[stat.tone ?? 'default'],
        )}
      >
        {stat.value ?? '—'}
      </span>
    </div>
  )
}

const flockColumns: Column<ClosedFlock>[] = [
  {
    key: 'flock',
    header: 'Flock',
    render: (f) => (
      <PrimaryCell
        initials={f.initials}
        title={`${f.code} · ${f.type}`}
        subtitle={`Pen ${f.pen} · ${f.breed}`}
      />
    ),
  },
  { key: 'placed', header: 'Placed', width: 120, render: (f) => <TextCell>{f.placed}</TextCell> },
  { key: 'closed', header: 'Closed', width: 120, render: (f) => <TextCell>{f.closed}</TextCell> },
  {
    key: 'birds',
    header: 'Birds in / out',
    align: 'right',
    width: 140,
    render: (f) => (
      <NumberCell>
        {formatNumber(f.birdsIn)} / {formatNumber(f.birdsOut)}
      </NumberCell>
    ),
  },
  { key: 'mortality', header: 'Mortality', align: 'right', width: 96, render: (f) => <NumberCell>{f.mortalityPct.toFixed(1)}%</NumberCell> },
  {
    key: 'fcr',
    header: 'FCR',
    align: 'right',
    width: 80,
    render: (f) => (f.fcr === null ? <NumberCell tone="muted">—</NumberCell> : <NumberCell>{f.fcr.toFixed(2)}</NumberCell>),
  },
  {
    key: 'margin',
    header: 'Margin',
    align: 'right',
    width: 130,
    render: (f) => <NumberCell tone={f.margin >= 0 ? 'success' : 'danger'}>{formatNaira(f.margin)}</NumberCell>,
  },
]
