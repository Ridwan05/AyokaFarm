'use client'

import { Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BarChart } from '../components/charts/BarChart'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert, AlertAction } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card, CardHeader, CardLink } from '../components/ui/Card'
import { KeyValueRow } from '../components/ui/KeyValueRow'
import { KpiCard } from '../components/ui/KpiCard'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { NumberCell, Table, TextCell, type Column } from '../components/ui/Table'
import { Tabs } from '../components/ui/Tabs'
import { penDetails, type DailyEntry, type PenDetail as PenDetailData } from '../data/penDetail'
import { pens } from '../data/pens'
import { useCurrentUser } from '../data/sessionContext'
import { canRecordProduction } from '../lib/access'
import { formatCrates, formatNumber, formatSignedPct } from '../lib/format'
import Placeholder from './Placeholder'

const TABS = ['Overview', 'Production', 'Sales', 'Medication', 'Costs & profit'] as const

export default function PenDetail() {
  const { penId } = useParams<{ penId: string }>()
  const id = Number(penId)
  const router = useRouter()
  const user = useCurrentUser()
  const detail = penDetails[id]
  const pen = pens.find((p) => p.id === id)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [showSpike, setShowSpike] = useState(true)
  const [acknowledged, setAcknowledged] = useState(false)

  if (!pen) return <Placeholder title="Pen not found" />

  const title = detail?.title ?? `Pen ${pen.id} · ${pen.type}`
  const subtitle =
    detail?.subtitle ?? `Flock ${pen.flock} · ${pen.breed} · week ${pen.week}`

  return (
    <>
      <PageHeader
        backTo={user.role === 'pen-attendant' ? '/' : '/pens'}
        eyebrow={[user.role === 'pen-attendant' ? 'My pens' : 'Pens & flocks', `Pen ${pen.id}`]}
        title={title}
        description={subtitle}
        actions={
          <>
            <Button leadingIcon={Phone}>Call vet</Button>
            {canRecordProduction(user, pen.id) && (
              <Button variant="primary" leadingIcon={Plus} onClick={() => router.push(`/production/entry/${pen.id}`)}>
                Record entry
              </Button>
            )}
          </>
        }
      />

      {detail?.spike && showSpike && (
        <Alert
          tone="danger"
          title={detail.spike.title}
          action={
            <AlertAction onClick={() => setAcknowledged(true)}>
              {acknowledged ? 'Acknowledged' : 'Acknowledge & add note'}
            </AlertAction>
          }
          onDismiss={() => setShowSpike(false)}
        >
          {detail.spike.body}
        </Alert>
      )}

      <Tabs label="Pen sections" tabs={TABS} value={tab} onChange={setTab} />

      {!detail ? (
        <Card className="items-center p-12">
          <p className="type-body-md text-fg-tertiary">No history recorded for this pen in the sample data yet.</p>
        </Card>
      ) : tab === 'Overview' ? (
        <Overview detail={detail} />
      ) : (
        <Card className="items-center p-12">
          <p className="type-body-md text-fg-tertiary">{tab} for this pen is coming next.</p>
        </Card>
      )}
    </>
  )
}

function Overview({ detail }: { detail: PenDetailData }) {
  const [unit, setUnit] = useState<'Birds' | '% of flock'>('Birds')
  const { mortality, flock } = detail
  const firstRising = mortality.daily.length - mortality.risingDays

  // "% of flock" rescales the same series against live birds.
  const asPct = unit === '% of flock'
  const scale = (v: number) => (asPct ? +((v / flock.liveNow) * 100).toFixed(2) : v)
  const values = mortality.daily.map(scale)
  const yTicks = asPct ? [0, 0.45, 0.9] : [0, 5, 10]
  const threshold = scale(mortality.thresholdBirds)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {detail.kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1 gap-4 px-5 pt-4 pb-5">
          <div className="flex items-center gap-4">
            <div className="flex flex-1 flex-col">
              <h2 className="type-h3 text-fg-primary">Daily mortality</h2>
              <p className="type-body-sm text-fg-tertiary">Birds lost per day · last 30 days</p>
            </div>
            <SegmentedControl label="Mortality unit" options={['Birds', '% of flock'] as const} value={unit} onChange={setUnit} />
          </div>
          <BarChart
            values={values}
            yTicks={yTicks}
            xLabels={mortality.xLabels}
            threshold={{ value: threshold, label: mortality.thresholdLabel }}
            labelLast={{ color: 'var(--ayk-color-text-danger)' }}
            colorFor={(v, i) =>
              v > threshold
                ? 'var(--ayk-color-bg-danger)'
                : i >= firstRising
                  ? 'var(--ayk-color-chart-2)'
                  : 'var(--ayk-color-chart-5)'
            }
          />
          <p className="flex gap-2 type-body-sm">
            <span className="type-label-sm text-fg-warning">{mortality.note}</span>
            <span className="text-fg-secondary">{mortality.typical}</span>
          </p>
        </Card>

        <Card className="w-full shrink-0 lg:w-[400px] gap-1 self-stretch px-5 pt-4 pb-5">
          <div className="flex items-center pb-2">
            <h2 className="flex-1 type-h3 text-fg-primary">Flock {flock.code}</h2>
            <CardLink to={`/pens/${detail.penId}/edit`}>Edit</CardLink>
          </div>
          <KeyValueRow label="Breed">{flock.breed}</KeyValueRow>
          <KeyValueRow label="Placed">{flock.placed}</KeyValueRow>
          <KeyValueRow label="Age" calculated>{flock.age}</KeyValueRow>
          <KeyValueRow label="Birds placed">{formatNumber(flock.birdsPlaced)}</KeyValueRow>
          <KeyValueRow label="Live now" calculated>{formatNumber(flock.liveNow)}</KeyValueRow>
          <KeyValueRow label="Feed type">{flock.feedType}</KeyValueRow>
          <KeyValueRow label="Expected feed" calculated>{flock.expectedFeed}</KeyValueRow>
          <KeyValueRow label="Withdrawal">{flock.withdrawal}</KeyValueRow>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Daily entries"
          meta={<span className="type-body-sm text-fg-tertiary">Last 7 days · open a row for detail and edit history</span>}
          action={{ label: 'Export', to: '#' }}
        />
        <Table columns={entryColumns(mortality.thresholdBirds, mortality.typicalMax)} rows={detail.entries} rowKey={(e) => e.date} />
      </Card>
    </>
  )
}

function entryColumns(threshold: number, typicalMax: number): Column<DailyEntry>[] {
  return [
    { key: 'date', header: 'Date', width: 130, render: (e) => <TextCell tone="primary">{e.date}</TextCell> },
    {
      key: 'died',
      header: 'Died',
      align: 'right',
      width: 80,
      render: (e) => (
        <NumberCell tone={e.died > threshold ? 'danger' : e.died > typicalMax ? 'warning' : 'default'}>{e.died}</NumberCell>
      ),
    },
    { key: 'feed', header: 'Feed', align: 'right', width: 110, render: (e) => <NumberCell>{e.feedBags.toFixed(1)} bags</NumberCell> },
    { key: 'vs', header: 'vs expected', align: 'right', width: 120, render: (e) => <NumberCell>{formatSignedPct(e.feedVsExpected)}</NumberCell> },
    { key: 'eggs', header: 'Eggs', align: 'right', width: 120, render: (e) => <NumberCell>{formatCrates(e.eggs)}</NumberCell> },
    { key: 'laying', header: 'Laying', align: 'right', width: 74, render: (e) => <NumberCell>{e.layingRate.toFixed(1)}%</NumberCell> },
    {
      key: 'med',
      header: 'Medication',
      render: (e) => (e.medication ? <TextCell>{e.medication}</TextCell> : <TextCell tone="tertiary">—</TextCell>),
    },
    {
      key: 'by',
      header: 'Recorded by',
      width: 220,
      render: (e) => <TextCell tone={e.late ? 'info' : 'secondary'}>{e.recordedBy}</TextCell>,
    },
  ]
}
