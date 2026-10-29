'use client'

import { CalendarDays, Download, PenLine, Warehouse } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { InfoTip } from '../components/ui/InfoTip'
import { KpiCard } from '../components/ui/KpiCard'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Select } from '../components/ui/Select'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../components/ui/Table'
import { pensToday, type PenToday } from '../data/dashboard'
import { explain } from '../data/explain'
import { farmSettings } from '../data/farmSettings'
import { penKind, penName } from '../data/farmViews'
import {
  addDays,
  daysFrom,
  feedVariance,
  kpi,
  lastDays,
  layingRate,
  missingEntries,
  mortalityPct,
  penStaff,
  rowsIn,
  rowsOn,
  sum,
  timeOf,
  todayISO,
  weekStart,
  weekdayDayMonth,
  withdrawals,
  type Range,
} from '../data/metrics'
import { withTodaysRecord } from '../data/production'
import type { DailyRow } from '../data/remote'
import { farm } from '../data/session'
import { useCurrentUser } from '../data/sessionContext'
import { useTrade } from '../data/tradeContext'
import { EntryActions } from '../features/production/EntryActions'
import { canRecordProduction, canSeePen, isAttendant } from '../lib/access'
import { downloadCsv } from '../lib/export'
import { formatCrates, formatDayMon, formatNumber, formatShortDate, formatSignedPct, parseISODate } from '../lib/format'

const PERIODS = ['Day', 'Week', 'Month'] as const
type Period = (typeof PERIODS)[number]
const PEN_FILTERS = ['All pens', 'Layers', 'Broilers'] as const

/** One pen over the chosen day, week or month. */
type PenEntry = {
  penId: number
  initials: string
  name: string
  /** Flock code, plus any status such as a medication withdrawal. */
  flock: string
  ageWeeks: number
  opening: number
  /** null when nothing was recorded */
  entry: {
    died: number
    /** Mortality above the alert threshold. */
    diedFlag: boolean
    closing: number
    feedBags: number
    feedVsExpected: number | null
    /** Total eggs; null for broiler pens. */
    eggs: number | null
    layingRate: number | null
    recordedBy: string
  } | null
}

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
    render: (p) => (p.entry ? <NumberCell tone={p.entry.diedFlag ? 'warning' : 'default'}>{formatNumber(p.entry.died)}</NumberCell> : dash),
  },
  {
    key: 'closing',
    header: 'Closing',
    align: 'right',
    width: 92,
    render: (p) => (p.entry ? <NumberCell>{formatNumber(p.entry.closing)}</NumberCell> : dash),
  },
  {
    key: 'feed',
    header: 'Feed',
    align: 'right',
    width: 96,
    render: (p) => (p.entry ? <NumberCell>{p.entry.feedBags.toFixed(1)} bags</NumberCell> : dash),
  },
  {
    key: 'vs',
    header: 'vs expected',
    align: 'right',
    width: 112,
    render: (p) =>
      p.entry?.feedVsExpected != null ? (
        <NumberCell tone={Math.abs(p.entry.feedVsExpected) >= farmSettings.feedVariancePct ? 'warning' : 'default'}>{formatSignedPct(p.entry.feedVsExpected)}</NumberCell>
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
    render: (p) => (p.entry ? <TextCell>{p.entry.recordedBy}</TextCell> : <TextCell tone="danger">Missing</TextCell>),
  },
]

/** The day, or the week / month up to and including it. */
function rangeFor(period: Period, day: string): Range {
  if (period === 'Day') return { from: day, to: day, label: weekdayDayMonth(day) }
  if (period === 'Week') {
    const from = weekStart(day)
    return { from, to: day, label: `Week of ${formatDayMon(from)}` }
  }
  return { from: day.slice(0, 8) + '01', to: day, label: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`)) }
}

export default function Production() {
  const router = useRouter()
  const user = useCurrentUser()
  const trade = useTrade()
  const { history, catalog, productionRecords } = trade
  const today = todayISO()
  const attendant = isAttendant(user.role)
  const mine = (id: number) => canSeePen(user, id)

  // Days that have entries, newest first, always starting with today.
  const days = [...new Set([today, ...history.daily.filter((d) => mine(d.penId)).map((d) => d.date)])].sort().reverse().slice(0, 90)
  const [period, setPeriod] = useState<Period>('Day')
  const [day, setDay] = useState(days[1] ?? today)
  const [pens, setPens] = useState<(typeof PEN_FILTERS)[number]>('All pens')
  const [showMissing, setShowMissing] = useState(true)

  const range = rangeFor(period, day)
  const span = daysFrom(range.from, range.to) + 1
  const prev: Range = { from: addDays(range.from, -span), to: addDays(range.from, -1), label: 'previous' }
  const penOk = (id: number) => mine(id) && (pens === 'All pens' || penKind(catalog, id) === pens)
  const rows = penRows(trade, range, penOk)
  const periodRows = rowsIn(history.daily, range, penOk)
  const prevRows = rowsIn(history.daily, prev, penOk)

  const todayRows = pensToday.filter((p) => mine(p.id)).map((p) => withTodaysRecord(p, productionRecords))
  const missing = missingEntries(history, today).filter((m) => mine(m.penId) && m.late)
  const recorded = rows.filter((p) => p.entry).length

  const died = sum(periodRows, (d) => d.mortality)
  const feed = sum(periodRows, (d) => d.feedBags)
  const eggs = sum(periodRows, (d) => d.eggs ?? 0)
  const crates = Math.floor(eggs / farmSettings.eggsPerCrate)
  const loose = eggs % farmSettings.eggsPerCrate
  const variance = feedVariance(periodRows)
  const laying = layingRate(periodRows)

  function exportRows() {
    downloadCsv(
      `production-${range.from}${range.to !== range.from ? `-to-${range.to}` : ''}`,
      ['Pen', 'Flock', 'Age (weeks)', 'Opening', 'Died', 'Closing', 'Feed (bags)', 'Feed vs expected %', 'Eggs', 'Laying rate %', 'Recorded by'],
      rows.map((p) => [p.name, p.flock, p.ageWeeks, p.opening, p.entry?.died, p.entry?.closing, p.entry?.feedBags.toFixed(2), p.entry?.feedVsExpected?.toFixed(1), p.entry?.eggs, p.entry?.layingRate?.toFixed(1), p.entry?.recordedBy ?? 'Missing']),
    )
  }

  const yesterdayMissing = missing.map((m) => penName(catalog, m.penId))

  return (
    <>
      <PageHeader
        eyebrow={['Operate', 'Production']}
        title="Daily production"
        description={
          yesterdayMissing.length
            ? `Every pen-day entry in one place. Yesterday is missing ${yesterdayMissing.join(', ')}.`
            : 'Every pen-day entry in one place. Yesterday is complete.'
        }
        actions={
          <Button leadingIcon={Download} onClick={exportRows}>
            Export
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Period" options={PERIODS} value={period} onChange={setPeriod} />
        <Select
          label="Date"
          leadingIcon={CalendarDays}
          options={days}
          value={day}
          onChange={setDay}
          format={(d) => `${formatShortDate(parseISODate(d))} ${d.slice(0, 4)}`}
        />
        <Select label="Pens" leadingIcon={Warehouse} width={180} options={PEN_FILTERS} value={pens} onChange={setPens} />
        <span className="flex-1" />
        <p className="type-body-sm whitespace-nowrap text-fg-tertiary">
          {period === 'Day' ? `${recorded} of ${rows.length} pens recorded` : `${periodRows.length} entries · ${span} days`}
        </p>
      </div>

      <TodayCard rows={todayRows} canRecord={(id) => canRecordProduction(user, id)} />

      {!attendant && (
        <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
          {productionKpis(history.daily, range, prev, periodRows, prevRows, penOk).map((k) => (
            <KpiCard key={k.label} kpi={k} />
          ))}
        </div>
      )}

      {showMissing && missing.length > 0 && (
        <Alert title={`${yesterdayMissing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} no entry for ${weekdayDayMonth(missing[0].date)}`} onDismiss={() => setShowMissing(false)}>
          {missing
            .map((m) => {
              const who = penStaff(catalog, m.penId)
              return `${penName(catalog, m.penId)}: ${who.length ? `assigned to ${who.join(', ')}` : 'nobody assigned'}`
            })
            .join(' · ')}
          . Entries are made on the day; a missed day stays blank in the records.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`Pen entries · ${range.label}`}
          meta={<span className="type-body-sm text-fg-tertiary">{period === 'Day' ? 'Opening and closing birds are calculated' : 'Opening is the first day, closing the last'}</span>}
        />
        <Table
          columns={columns}
          rows={rows}
          rowKey={(p) => String(p.penId)}
          onRowClick={(p) => router.push(`/pens/${p.penId}`)}
          // One day shows one entry per pen, which can be corrected or deleted here.
          rowActions={period === 'Day' ? (p) => <EntryActions row={history.daily.find((d) => d.penId === p.penId && d.date === day)} /> : undefined}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-b-xl bg-canvas px-5 py-3 type-label-md">
          <span className="flex flex-1 items-center gap-1.5 text-fg-primary">
            Farm total · {range.label}
            <InfoTip label="Farm total">
              The pens above added up. Feed % = feed used vs expected for the birds’ age; crates = eggs ÷ {farmSettings.eggsPerCrate}; laying = eggs ÷ hens at the start of each day.
            </InfoTip>
          </span>
          <span className="text-fg-secondary">{formatNumber(died)} died</span>
          <span className="text-fg-secondary">
            {feed.toFixed(1)} bags feed{variance !== null && ` (${formatSignedPct(variance)})`}
          </span>
          <span className="text-fg-secondary">
            {formatNumber(crates)} crates{loose ? ` + ${loose} egg${loose > 1 ? 's' : ''}` : ''}
          </span>
          {laying !== null && <span className="text-fg-secondary">{laying.toFixed(1)}% laying</span>}
        </div>
      </Card>
    </>
  )
}

/** One row per pen with a flock in the range: a single day's entry, or the period added up. */
function penRows(trade: ReturnType<typeof useTrade>, range: Range, penOk: (id: number) => boolean): PenEntry[] {
  const { history, catalog } = trade
  const inWithdrawal = new Set(withdrawals(history, catalog, range.to).map((w) => w.penId))
  const flocks = history.flocks.filter((f) => penOk(f.pen_id) && f.placed_on <= range.to && (f.closed_on === null || f.closed_on >= range.from))
  return flocks
    .map((f) => {
      const rows = history.daily.filter((d) => d.flockId === f.id && d.date >= range.from && d.date <= range.to).sort((a, b) => a.date.localeCompare(b.date))
      const before = history.daily.filter((d) => d.flockId === f.id && d.date < range.from).sort((a, b) => b.date.localeCompare(a.date))[0]
      const first: DailyRow | undefined = rows[0]
      const last: DailyRow | undefined = rows.at(-1)
      const ageDays = last?.ageDays ?? daysFrom(f.placed_on, range.to) + f.age_at_placement_days
      const kind = penKind(catalog, f.pen_id)
      const firstName = (n: string) => n.split(' ')[0]
      const recorders = [...new Set(rows.map((r) => firstName(r.recordedBy)))]
      const mort = mortalityPct(rows)
      return {
        penId: f.pen_id,
        initials: `P${f.pen_id}`,
        name: `${penName(catalog, f.pen_id)} · ${kind}`,
        flock: inWithdrawal.has(f.pen_id) ? `${f.code} · withdrawal` : f.code,
        ageWeeks: Math.floor(ageDays / 7) + 1,
        opening: first?.opening ?? before?.closing ?? f.birds_placed,
        entry: last
          ? {
              died: sum(rows, (r) => r.mortality),
              diedFlag: (mort ?? 0) > farmSettings.mortalityAlertPct,
              closing: last.closing,
              feedBags: sum(rows, (r) => r.feedBags),
              feedVsExpected: feedVariance(rows),
              eggs: rows.some((r) => r.eggs !== null) ? sum(rows, (r) => r.eggs ?? 0) : null,
              layingRate: layingRate(rows),
              recordedBy: rows.length === 1 ? `${firstName(last.recordedBy)} · ${timeOf(last.createdAt)}` : `${rows.length} entries · ${recorders.join(', ')}`,
            }
          : null,
      }
    })
    .sort((a, b) => a.penId - b.penId)
}

function productionKpis(daily: DailyRow[], range: Range, prev: Range, cur: DailyRow[], old: DailyRow[], penOk: (id: number) => boolean) {
  const spark = lastDays(Math.max(8, Math.min(30, daysFrom(range.from, range.to) + 1)), range.to)
  const day = (d: string) => rowsOn(daily, d, penOk)
  const per = farmSettings.eggsPerCrate
  const vs = range.from === range.to ? `vs ${formatShortDate(parseISODate(prev.from))}` : 'vs previous period'
  const eggs = sum(cur, (d) => d.eggs ?? 0)
  const lay = layingRate(cur)
  const died = sum(cur, (d) => d.mortality)
  const bags = sum(cur, (d) => d.feedBags)
  const expectedBags = sum(cur, (d) => (d.expectedKg && d.feedKg && d.feedBags ? (d.expectedKg * d.feedBags) / d.feedKg : 0))
  const layerPens = new Set(cur.filter((d) => d.eggs !== null).map((d) => d.penId)).size
  return [
    kpi({
      label: 'Eggs collected',
      value: formatNumber(Math.floor(eggs / per)),
      unit: 'crates',
      current: eggs,
      previous: sum(old, (d) => d.eggs ?? 0) || null,
      context: vs,
      info: `Eggs collected in daily entries ÷ ${per} eggs a crate, across layer pens, compared with the period before.`,
      spark: spark.map((d) => sum(day(d), (r) => r.eggs ?? 0) / per),
    }),
    kpi({
      label: 'Laying rate',
      value: lay === null ? '—' : lay.toFixed(1),
      unit: '%',
      current: lay,
      previous: layingRate(old),
      points: true,
      digits: 1,
      context: `${layerPens} layer pens`,
      info: 'Eggs collected ÷ hens at the start of each day, layer pens only, compared with the period before.',
      spark: spark.map((d) => layingRate(day(d)) ?? 0),
    }),
    kpi({
      label: 'Mortality',
      value: formatNumber(died),
      unit: 'birds',
      current: died,
      previous: old.length ? sum(old, (d) => d.mortality) : null,
      goodWhen: 'down',
      context: `${(mortalityPct(cur) ?? 0).toFixed(2)}% · ${vs}`,
      info: 'Deaths recorded in daily entries for all pens, compared with the period before.',
      spark: spark.map((d) => sum(day(d), (r) => r.mortality)),
    }),
    kpi({
      label: 'Feed used',
      value: bags.toFixed(1),
      unit: 'bags',
      current: bags,
      previous: old.length ? sum(old, (d) => d.feedBags) : null,
      goodWhen: 'neither',
      context: expectedBags ? `vs ${expectedBags.toFixed(1)} expected` : vs,
      info: 'Bags of feed recorded in daily entries for all pens, compared with the period before.',
      spark: spark.map((d) => sum(day(d), (r) => r.feedBags)),
    }),
  ]
}

/** Today's pens: who has recorded, and a shortcut to the entry form for those still due. */
function TodayCard({ rows, canRecord }: { rows: PenToday[]; canRecord: (penId: number) => boolean }) {
  const done = rows.filter((p) => p.died !== null).length
  return (
    <Card>
      <CardHeader
        title={`Today · ${formatShortDate(farm.today)}`}
        info={`${explain.entriesRecorded()} Laying = eggs collected ÷ hens at the start of the day.`}
        meta={
          <span className="type-body-sm text-fg-tertiary">
            {done} of {rows.length} recorded · due by {farmSettings.missingEntryCutoff}
          </span>
        }
      />
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
