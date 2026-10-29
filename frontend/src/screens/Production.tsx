'use client'

import { CalendarDays, Download, PenLine, Warehouse } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert, AlertAction } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { KpiCard } from '../components/ui/KpiCard'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../components/ui/Table'
import { missingEntry, penEntries as allPenEntries, productionDays, productionKpis, productionTotals, type PenEntry, type ProductionDay } from '../data/production'
import { pensToday, type PenToday } from '../data/dashboard'
import { withTodaysRecord } from '../data/production'
import { useCurrentUser } from '../data/sessionContext'
import { useTrade } from '../data/tradeContext'
import { canRecordProduction, canSeePen, isAttendant } from '../lib/access'
import { farm } from '../data/session'
import { formatCrates, formatNumber, formatShortDate, formatSignedPct, parseISODate } from '../lib/format'
import { farmSettings } from '../data/farmSettings'

const PERIODS = ['Day', 'Week', 'Month'] as const
const PEN_FILTERS = ['All pens', 'Layers', 'Broilers'] as const

const dash = <NumberCell tone="muted">—</NumberCell>

const columns: Column<PenEntry>[] = [
  { key: 'pen', header: 'Pen', render: (p) => <PrimaryCell initials={p.initials} title={p.name} subtitle={p.flock} /> },
  { key: 'age', header: 'Age', width: 76, render: (p) => <TextCell>wk {p.ageWeeks}</TextCell> },
  { key: 'opening', header: 'Opening', align: 'right', width: 92, render: (p) => <NumberCell>{formatNumber(p.opening)}</NumberCell> },
  {
    key: 'died',
    header: 'Died',
    align: 'right',
    width: 64,
    render: (p) => (p.entry ? <NumberCell tone={p.entry.diedFlag ? 'warning' : 'default'}>{p.entry.died}</NumberCell> : dash),
  },
  {
    key: 'closing',
    header: 'Closing',
    align: 'right',
    width: 92,
    render: (p) => (p.entry ? <NumberCell>{formatNumber(p.opening - p.entry.died)}</NumberCell> : dash),
  },
  {
    key: 'feed',
    header: 'Feed',
    align: 'right',
    width: 84,
    render: (p) => (p.entry ? <NumberCell>{p.entry.feedBags.toFixed(1)} bags</NumberCell> : dash),
  },
  {
    key: 'vs',
    header: 'vs expected',
    align: 'right',
    width: 112,
    render: (p) =>
      p.entry ? (
        <NumberCell tone={Math.abs(p.entry.feedVsExpected) >= farmSettings.feedVariancePct ? 'warning' : 'default'}>
          {formatSignedPct(p.entry.feedVsExpected)}
        </NumberCell>
      ) : (
        dash
      ),
  },
  {
    key: 'eggs',
    header: 'Eggs',
    align: 'right',
    width: 112,
    render: (p) => (p.entry?.eggs != null ? <NumberCell>{formatCrates(p.entry.eggs, farmSettings.eggsPerCrate)}</NumberCell> : dash),
  },
  {
    key: 'laying',
    header: 'Laying',
    align: 'right',
    width: 80,
    render: (p) => (p.entry?.layingRate != null ? <NumberCell>{p.entry.layingRate.toFixed(1)}%</NumberCell> : dash),
  },
  {
    key: 'by',
    header: 'Recorded by',
    width: 138,
    render: (p) =>
      p.entry ? <TextCell>{`${p.entry.recordedBy} · ${p.entry.time}`}</TextCell> : <TextCell tone="danger">Missing</TextCell>,
  },
]

export default function Production() {
  const router = useRouter()
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('Day')
  const [day, setDay] = useState<ProductionDay>(productionDays[0])
  const [pens, setPens] = useState<(typeof PEN_FILTERS)[number]>('All pens')
  const [showMissing, setShowMissing] = useState(true)
  const [reminded, setReminded] = useState(false)
  const user = useCurrentUser()
  const { productionRecords } = useTrade()
  const attendant = isAttendant(user.role)
  const penEntries = allPenEntries.filter((p) => canSeePen(user, p.penId))
  const today = pensToday.filter((p) => canSeePen(user, p.id)).map((p) => withTodaysRecord(p, productionRecords))

  const date = parseISODate(day)
  const dateLabel = formatShortDate(date)
  const rows = penEntries.filter(
    (p) => pens === 'All pens' || p.name.endsWith(pens),
  )
  const recorded = penEntries.filter((p) => p.entry).length
  const missingPen = penEntries.find((p) => p.penId === missingEntry.penId)

  const entries = penEntries.flatMap((p) => (p.entry ? [p.entry] : []))
  const died = entries.reduce((n, e) => n + e.died, 0)
  const feed = entries.reduce((n, e) => n + e.feedBags, 0)
  const eggs = entries.reduce((n, e) => n + (e.eggs ?? 0), 0)
  const crates = Math.floor(eggs / farmSettings.eggsPerCrate)
  const loose = eggs % farmSettings.eggsPerCrate

  return (
    <>
      <PageHeader sample
        eyebrow={['Operate', 'Production']}
        title="Daily production"
        description={`Every pen-day entry in one place. Yesterday is complete except Pen ${missingEntry.penId}.`}
        actions={<Button leadingIcon={Download}>Export</Button>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        <Select
          label="Date"
          leadingIcon={CalendarDays}
          options={productionDays}
          value={day}
          onChange={setDay}
          format={(d) => `${formatShortDate(parseISODate(d))} ${parseISODate(d).getFullYear()}`}
        />
        <Select label="Pens" leadingIcon={Warehouse} width={180} options={PEN_FILTERS} value={pens} onChange={setPens} />
        <span className="flex-1" />
        <p className="type-body-sm whitespace-nowrap text-fg-tertiary">
          {recorded} of {penEntries.length} pens recorded
        </p>
      </div>

      <TodayCard rows={today} canRecord={(id) => canRecordProduction(user, id)} />

      {!attendant && (
        <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
          {productionKpis.map((kpi) => (
            <KpiCard key={kpi.label} kpi={kpi} />
          ))}
        </div>
      )}

      {showMissing && missingPen && (
        <Alert
          title={`Pen ${missingEntry.penId} has no entry for ${dateLabel}`}
          action={
            attendant ? undefined : (
              <AlertAction onClick={() => setReminded(true)}>
                {reminded ? `Reminder sent to ${missingEntry.staff}` : `Remind ${missingEntry.staff} on WhatsApp`}
              </AlertAction>
            )
          }
          onDismiss={() => setShowMissing(false)}
        >
          {missingEntry.staff} can still add it as a late entry until {missingEntry.lateUntil}. After that, the farm
          manager adds it with a reason.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`Pen entries · ${dateLabel}`}
          meta={<span className="type-body-sm text-fg-tertiary">Opening and closing birds are calculated</span>}
          action={{ label: 'Open entry history', to: '/production/history' }}
        />
        <Table columns={columns} rows={rows} rowKey={(p) => String(p.penId)} onRowClick={(p) => router.push(`/pens/${p.penId}`)} />
        <div className="flex items-center gap-6 rounded-b-xl bg-canvas px-5 py-3 type-label-md">
          <span className="flex-1 text-fg-primary">Farm total · {dateLabel}</span>
          <span className="text-fg-secondary">{died} died</span>
          <span className="text-fg-secondary">
            {feed.toFixed(1)} bags feed ({formatSignedPct(productionTotals.feedVsExpected)})
          </span>
          <span className="text-fg-secondary">
            {crates} crates{loose ? ` + ${loose} egg${loose > 1 ? 's' : ''}` : ''}
          </span>
          <span className="text-fg-secondary">{productionTotals.layingRate}% laying</span>
        </div>
      </Card>
    </>
  )
}

/** Today's pens: who has recorded, and a shortcut to the entry form for those still due. */
function TodayCard({ rows, canRecord }: { rows: PenToday[]; canRecord: (penId: number) => boolean }) {
  const done = rows.filter((p) => p.died !== null).length
  return (
    <Card>
      <CardHeader title={`Today · ${formatShortDate(farm.today)}`} meta={<span className="type-body-sm text-fg-tertiary">{done} of {rows.length} recorded · due by 18:00</span>} />
      <ul className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => {
          const due = p.died === null
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border border-line-subtle px-3 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-label-md text-fg-primary">{p.name}</span>
                <span className="truncate type-body-sm text-fg-tertiary">
                  {due ? p.entry.label : `${p.died} died · ${p.layingRate === null ? 'broilers' : `${p.layingRate.toFixed(1)}% laying`}`}
                </span>
              </span>
              {due && canRecord(p.id) ? (
                <Link
                  href={`/production/entry/${p.id}`}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand px-3 type-label-md text-fg-on-brand transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-brand-hover motion-safe:active:scale-[0.97]"
                >
                  <PenLine size={16} strokeWidth={1.5} />
                  Record
                </Link>
              ) : (
                <Badge dot tone={p.entry.tone}>
                  {due ? 'Due' : p.entry.label.replace('Recorded ', '')}
                </Badge>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
