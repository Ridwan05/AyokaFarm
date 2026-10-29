'use client'

import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { BarChart } from '../components/charts/BarChart'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert, AlertAction } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { InfoTip } from '../components/ui/InfoTip'
import { KeyValueRow } from '../components/ui/KeyValueRow'
import { KpiCard } from '../components/ui/KpiCard'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { NumberCell, Table, TextCell, type Column } from '../components/ui/Table'
import { Presence } from '../components/ui/Overlay'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../components/ui/toastContext'
import { farmSettings } from '../data/farmSettings'
import { explain } from '../data/explain'
import { penName } from '../data/farmViews'
import { addDays, dayMonth, inRange, niceTicks, penCost, penMoney, period, timeOf, todayISO, weekdayDm, withdrawals, type Range } from '../data/metrics'
import { flockFacts, mortalitySeries, modeLabel, penEntries, penFlock, penKpis, type DailyEntry } from '../data/penView'
import { useCurrentUser } from '../data/sessionContext'
import { rearingCost, suggestedLayStart } from '../data/rearing'
import { useTrade } from '../data/tradeContext'
import { AddBirdsDrawer } from '../features/pens/AddBirdsDrawer'
import { placementLabel } from '../features/pens/birdSourceRules'
import { CloseFlockDrawer } from '../features/pens/CloseFlockDrawer'
import { EditFlockDrawer } from '../features/pens/EditFlockDrawer'
import { EditPenModal } from '../features/pens/EditPenModal'
import { LayStartModal } from '../features/pens/LayStartModal'
import { CLOSE_REASONS, saveFlock } from '../features/pens/saveFlock'
import { accessOf, canRecordProduction, isAttendant } from '../lib/access'
import { downloadCsv } from '../lib/export'
import { formatCrates, formatNaira, formatNumber, formatSignedPct } from '../lib/format'
import Placeholder from './Placeholder'

const TABS = ['Overview', 'Production', 'Sales', 'Medication', 'Costs & profit'] as const

export default function PenDetail() {
  const { penId } = useParams<{ penId: string }>()
  const id = Number(penId)
  const router = useRouter()
  const user = useCurrentUser()
  const { history, catalog } = useTrade()
  const pen = catalog.pens.find((p) => p.id === id)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [showSpike, setShowSpike] = useState(true)
  const [editPen, setEditPen] = useState(false)

  if (!pen) return <Placeholder title="Pen not found" />

  const facts = flockFacts(history, catalog, id)
  const { rows } = penFlock(history, id)
  const latest = rows.at(-1)
  const today = todayISO()
  const spike =
    latest && latest.date >= addDays(today, -1) && (latest.mortalityPct ?? 0) > farmSettings.mortalityAlertPct
      ? {
          title: `Mortality spike — ${latest.mortality} birds ${latest.date === today ? 'today' : 'yesterday'} (${(latest.mortalityPct ?? 0).toFixed(2)}%), above the ${farmSettings.mortalityAlertPct}% threshold`,
          body: `Last 3 days: ${rows
            .slice(-3)
            .map((d) => d.mortality)
            .join(' · ')}. Recorded by ${latest.recordedBy} at ${timeOf(latest.createdAt)}. Check drinkers and respiratory signs; consider calling the vet.`,
        }
      : null

  const title = facts?.title ?? `${penName(catalog, id)} · Empty`
  const subtitle = !facts
    ? (pen.description ?? 'No flock placed')
    : facts.flock.status === 'closed'
      ? `Empty · last flock ${facts.code} closed ${dayMonth(facts.flock.closed_on!)} ${facts.flock.closed_on!.slice(0, 4)}`
      : `Flock ${facts.code} · ${facts.breed} · placed ${facts.placed} · week ${facts.week}`

  return (
    <>
      <PageHeader
        backTo={isAttendant(user.role) ? '/' : '/pens'}
        eyebrow={[isAttendant(user.role) ? 'My pens' : 'Pens & flocks', pen.name]}
        title={title}
        description={subtitle}
        actions={
          <>
            {user.role === 'owner' && (
              <Button leadingIcon={Pencil} onClick={() => setEditPen(true)}>
                Edit pen…
              </Button>
            )}
            {facts?.flock.status === 'active' && canRecordProduction(user, id) && (
              <Button variant="primary" leadingIcon={Plus} onClick={() => router.push(`/production/entry/${id}`)}>
                Record entry
              </Button>
            )}
          </>
        }
      />

      {spike && showSpike && (
        <Alert tone="danger" title={spike.title} action={<AlertAction onClick={() => router.push('/alerts')}>Open alerts</AlertAction>} onDismiss={() => setShowSpike(false)}>
          {spike.body}
        </Alert>
      )}

      <Tabs label="Pen sections" tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'Costs & profit' ? (
        <CostsTab penId={id} />
      ) : tab === 'Sales' ? (
        <SalesTab penId={id} />
      ) : tab === 'Medication' ? (
        <MedicationTab penId={id} />
      ) : !facts ? (
        <Card className="items-center p-12">
          <p className="type-body-md text-fg-tertiary">No flock has been placed in this pen yet.</p>
        </Card>
      ) : tab === 'Overview' ? (
        <Overview penId={id} />
      ) : (
        <ProductionTab penId={id} />
      )}

      <Presence>{editPen && <EditPenModal pen={catalog.allPens.find((p) => p.id === id) ?? { ...pen }} onClose={() => setEditPen(false)} />}</Presence>
    </>
  )
}

function Overview({ penId }: { penId: number }) {
  const { history, catalog, reload } = useTrade()
  const user = useCurrentUser()
  const toast = useToast()
  const [unit, setUnit] = useState<'Birds' | '% of flock'>('Birds')
  const [overlay, setOverlay] = useState<'lay' | 'close' | 'edit-flock' | 'add-birds' | null>(null)
  const [saving, setSaving] = useState(false)
  const facts = flockFacts(history, catalog, penId)!
  const flock = facts.flock
  const active = flock.status === 'active'
  const layer = catalog.birdTypes.find((b) => b.id === flock.bird_type_id)?.lays_eggs ?? false
  const layingSince = flock.laying_started_on ?? null
  const firstEggs = layer ? suggestedLayStart(history, flock) : null
  const suggested = layingSince ? null : firstEggs
  // Managers mark the start of lay; only the owner closes a flock (the database enforces both).
  const canMarkLay = layer && (user.role === 'owner' || user.role === 'farm-manager')
  const canClose = active && user.role === 'owner'
  const canEditFlock = user.role === 'owner'
  const canAddBirds = active && (user.role === 'owner' || user.role === 'farm-manager')
  const placements = history.placements.filter((p) => p.flock_id === flock.id).sort((a, b) => a.placed_on.localeCompare(b.placed_on) || a.id - b.id)
  const birdsCost = placements.reduce((n, p) => n + p.birds * Number(p.cost_per_bird ?? 0), 0)

  const markSuggested = async () => {
    if (!suggested) return
    setSaving(true)
    const ok = await saveFlock(flock.id, { laying_started_on: suggested })
    if (ok) await reload()
    setSaving(false)
    if (ok) toast(`${flock.code} laying since ${weekdayDm(suggested)}`)
  }
  const { rows } = penFlock(history, penId)
  const m = mortalitySeries(rows)
  const firstRising = m.risingDays ? m.birds.length - m.risingDays : m.birds.length

  // "% of flock" rescales each day against the birds at the start of that day.
  const asPct = unit === '% of flock'
  const values = asPct ? m.birds.map((v, i) => (m.opening[i] ? +((v / m.opening[i]) * 100).toFixed(2) : 0)) : m.birds
  const threshold = asPct ? farmSettings.mortalityAlertPct : m.thresholdBirds
  const yTicks = niceTicks(0, Math.max(threshold, ...values) || 1, 3).filter((t) => t >= 0)
  const entries = penEntries(history, catalog, penId, rows.slice(-7).reverse())
  const last = m.birds.at(-1) ?? 0

  return (
    <>
      {suggested && canMarkLay && (
        <Alert
          tone="info"
          title={`First eggs recorded ${weekdayDm(suggested)} — mark as start of lay?`}
          action={
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <AlertAction onClick={() => void markSuggested()}>{saving ? 'Saving…' : 'Use this date'}</AlertAction>
              <AlertAction onClick={() => setOverlay('lay')}>Pick another date…</AlertAction>
            </span>
          }
        >
          Rearing cost stops the day before. Until it’s marked, reports use this date.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {penKpis(history, catalog, penId).map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="min-w-0 flex-1 gap-4 px-5 pt-4 pb-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex min-w-[160px] flex-1 flex-col">
              <h2 className="type-h3 text-fg-primary">Daily mortality</h2>
              <p className="type-body-sm text-fg-tertiary">Birds lost per day · last 30 days</p>
            </div>
            <SegmentedControl label="Mortality unit" options={['Birds', '% of flock'] as const} value={unit} onChange={setUnit} />
          </div>
          <BarChart
            values={values}
            yTicks={yTicks}
            xLabels={m.xLabels}
            threshold={{ value: threshold, label: m.thresholdLabel }}
            labelLast={{ color: last > m.thresholdBirds ? 'var(--ayk-color-text-danger)' : 'var(--ayk-color-text-secondary)' }}
            colorFor={(v, i) => (v > threshold ? 'var(--ayk-color-bg-danger)' : i >= firstRising ? 'var(--ayk-color-chart-2)' : 'var(--ayk-color-chart-5)')}
          />
          <p className="flex flex-wrap items-center gap-x-2 type-body-sm">
            {m.risingDays > 0 && <span className="type-label-sm text-fg-warning">Rising {m.risingDays} days in a row</span>}
            <span className="text-fg-secondary">{m.typical}</span>
            <InfoTip label="Typical day">{explain.typicalMortality()} The red line is the alert threshold: {farmSettings.mortalityAlertPct}% of the birds.</InfoTip>
          </p>
        </Card>

        <Card className="w-full shrink-0 lg:w-[400px] gap-1 self-stretch px-5 pt-4 pb-5">
          <div className="flex items-center pb-2">
            <h2 className="flex-1 type-h3 text-fg-primary">Flock {facts.code}</h2>
          </div>
          <KeyValueRow label="Breed">{facts.breed}</KeyValueRow>
          <KeyValueRow label="Placed">{facts.placed}</KeyValueRow>
          <KeyValueRow label="Age" calculated={explain.flockAge()}>
            {facts.age}
          </KeyValueRow>
          <KeyValueRow label="Birds placed">{formatNumber(facts.birdsPlaced)}</KeyValueRow>
          {placements.length > 0 && (
            <div className="flex flex-col gap-0.5 py-2">
              <span className="type-body-md text-fg-secondary">Birds from</span>
              {placements.map((p) => (
                <span key={p.id} className="type-body-sm text-fg-primary">
                  {placementLabel(history, p, flock.placed_on)}
                </span>
              ))}
            </div>
          )}
          <KeyValueRow label="Cost of birds" calculated={explain.rearingBirds()}>
            {formatNaira(Math.round(birdsCost))}
          </KeyValueRow>
          <KeyValueRow label="Live now" calculated={explain.liveBirds()}>
            {formatNumber(facts.liveNow)}
          </KeyValueRow>
          <KeyValueRow label="Feed type">{facts.feedType}</KeyValueRow>
          <KeyValueRow label="Expected feed" calculated={explain.expectedFeed()}>
            {facts.expectedFeed}
          </KeyValueRow>
          <KeyValueRow label="Withdrawal" calculated={explain.withdrawal()}>
            {facts.withdrawal}
          </KeyValueRow>
          {layer && (
            <KeyValueRow label="Start of lay" calculated={explain.layStart()}>
              {layingSince ? `Laying since ${weekdayDm(layingSince)}` : suggested ? `Not marked · eggs from ${weekdayDm(suggested)}` : 'Not laying yet'}
            </KeyValueRow>
          )}
          {!active && flock.closed_on && (
            <KeyValueRow label="Closed">
              {weekdayDm(flock.closed_on)}
              {flock.close_reason ? ` · ${CLOSE_LABEL[flock.close_reason] ?? flock.close_reason}` : ''}
            </KeyValueRow>
          )}
          {(canMarkLay || canClose || canEditFlock || canAddBirds) && (
            <div className="flex flex-wrap gap-2 pt-3">
              {canEditFlock && (
                <Button size="sm" onClick={() => setOverlay('edit-flock')}>
                  Edit flock…
                </Button>
              )}
              {canAddBirds && (
                <Button size="sm" onClick={() => setOverlay('add-birds')}>
                  Add birds…
                </Button>
              )}
              {canMarkLay && (
                <Button size="sm" onClick={() => setOverlay('lay')}>
                  {layingSince ? 'Edit start of lay…' : 'Mark start of lay…'}
                </Button>
              )}
              {canClose && (
                <Button size="sm" variant="ghost" className="text-fg-danger" onClick={() => setOverlay('close')}>
                  Close flock…
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      <RearingCard penId={penId} />

      <Presence>{overlay === 'lay' && <LayStartModal flock={flock} suggested={firstEggs} onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{overlay === 'close' && <CloseFlockDrawer flock={flock} onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{overlay === 'edit-flock' && <EditFlockDrawer flock={flock} onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{overlay === 'add-birds' && <AddBirdsDrawer flock={flock} onClose={() => setOverlay(null)} />}</Presence>

      <Card>
        <CardHeader title="Daily entries" meta={<span className="type-body-sm text-fg-tertiary">Last 7 entries</span>} />
        {entries.length ? (
          <Table columns={entryColumns(m.thresholdBirds, m.typicalMax)} rows={entries} rowKey={(e) => e.iso} />
        ) : (
          <p className="px-5 pb-6 type-body-md text-fg-tertiary">No entries recorded for this flock yet.</p>
        )}
      </Card>
    </>
  )
}

const CLOSE_LABEL: Record<string, string> = Object.fromEntries(CLOSE_REASONS.map((r) => [r.value, r.label]))

/** What the flock cost from placement to point of lay (layers) or to date (broilers). */
/** Roles that only see their own expenses (RLS) get totals that leave out farm costs; say so. */
function PartialCostsNote() {
  const user = useCurrentUser()
  if (accessOf(user, 'expenses', 'view') === 'all') return null
  return <p className="type-body-sm text-fg-warning">Your role only sees expenses you recorded, so farm costs and other people’s expenses are left out of these totals.</p>
}

function RearingCard({ penId }: { penId: number }) {
  const { history, catalog } = useTrade()
  const flock = flockFacts(history, catalog, penId)!.flock
  const r = rearingCost(history, catalog, flock)
  const title = r.layer
    ? r.done
      ? 'Rearing cost · placement → point of lay'
      : `Rearing cost so far · week ${r.week}`
    : `Cost · placement to ${flock.closed_on ? 'close' : 'date'}`
  const howTotal = r.done || !r.layer ? explain.rearingTotal() : explain.rearingSoFar()
  return (
    <Card className="gap-1 px-5 pt-4 pb-5">
      <div className="flex flex-wrap items-center gap-x-2 pb-2">
        <h2 className="type-h3 text-fg-primary">{title}</h2>
        <InfoTip label="Rearing cost">{howTotal}</InfoTip>
        <span className="flex-1" />
        <span className="type-body-sm text-fg-tertiary">{r.to >= r.from ? `${weekdayDm(r.from)} – ${weekdayDm(r.to)}` : 'Not started'}</span>
      </div>
      <PartialCostsNote />
      {r.provisional && r.layingSince && (
        <p className="pb-1 type-body-sm text-fg-warning">Start of lay not marked — using first eggs ({weekdayDm(r.layingSince)}).</p>
      )}
      <div className="grid gap-x-8 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <KeyValueRow label="Birds" calculated={explain.rearingBirds()}>
            {formatNaira(Math.round(r.birds))}
          </KeyValueRow>
          <KeyValueRow label="Feed" calculated={explain.rearingFeed()}>
            {formatNaira(Math.round(r.feed))} · {formatNumber(Math.round(r.feedBags))} bags
          </KeyValueRow>
          <KeyValueRow label="Medication" calculated={explain.rearingMedication()}>
            {formatNaira(Math.round(r.medication))} · {formatNumber(r.doses)} doses
          </KeyValueRow>
        </div>
        <div className="flex min-w-0 flex-col">
          <KeyValueRow label="Pen expenses" calculated={explain.penExpenses()}>
            {formatNaira(Math.round(r.penExpenses))}
          </KeyValueRow>
          <KeyValueRow label="Share of farm costs" calculated={explain.overheadShare()}>
            {formatNaira(Math.round(r.overhead))}
          </KeyValueRow>
          {r.layer && r.perHen !== null && (
            <KeyValueRow label="Cost per hen at lay" calculated={explain.costPerHenAtLay()}>
              {formatNaira(Math.round(r.perHen))}
            </KeyValueRow>
          )}
        </div>
      </div>
      <KeyValueRow label="Total" strong calculated={howTotal}>
        {formatNaira(Math.round(r.total))}
      </KeyValueRow>
      <p className="type-body-sm text-fg-tertiary">
        {formatNumber(Math.round(r.feedKg))} kg of feed{r.layer && r.hens ? ` · ${formatNumber(r.hens)} hens at point of lay` : ''}
      </p>
    </Card>
  )
}

function entryColumns(threshold: number, typicalMax: number): Column<DailyEntry>[] {
  const dash = <NumberCell tone="muted">—</NumberCell>
  return [
    { key: 'date', header: 'Date', width: 130, render: (e) => <TextCell tone="primary">{e.date}</TextCell> },
    {
      key: 'died',
      header: 'Died',
      align: 'right',
      width: 80,
      render: (e) => <NumberCell tone={e.died > threshold ? 'danger' : e.died > typicalMax ? 'warning' : 'default'}>{e.died}</NumberCell>,
    },
    { key: 'feed', header: 'Feed', align: 'right', width: 110, render: (e) => <NumberCell>{e.feedBags.toFixed(1)} bags</NumberCell> },
    {
      key: 'vs',
      header: 'vs expected',
      align: 'right',
      width: 120,
      render: (e) =>
        e.feedVsExpected === null ? dash : <NumberCell tone={Math.abs(e.feedVsExpected) > farmSettings.feedVariancePct ? 'warning' : 'default'}>{formatSignedPct(e.feedVsExpected)}</NumberCell>,
    },
    { key: 'eggs', header: 'Eggs', align: 'right', width: 120, render: (e) => (e.eggs === null ? dash : <NumberCell>{formatCrates(e.eggs, farmSettings.eggsPerCrate)}</NumberCell>) },
    { key: 'laying', header: 'Laying', align: 'right', width: 74, render: (e) => (e.layingRate === null ? dash : <NumberCell>{e.layingRate.toFixed(1)}%</NumberCell>) },
    { key: 'med', header: 'Medication', render: (e) => (e.medication ? <TextCell>{e.medication}</TextCell> : <TextCell tone="tertiary">—</TextCell>) },
    { key: 'by', header: 'Recorded by', width: 220, render: (e) => <TextCell tone={e.late ? 'info' : 'secondary'}>{e.recordedBy}</TextCell> },
  ]
}

function ProductionTab({ penId }: { penId: number }) {
  const { history, catalog } = useTrade()
  const { rows } = penFlock(history, penId)
  const from = addDays(todayISO(), -29)
  const entries = penEntries(history, catalog, penId, rows.filter((d) => d.date >= from).reverse())
  const m = mortalitySeries(rows)

  function exportRows() {
    downloadCsv(
      `${penName(catalog, penId).toLowerCase().replace(/\s+/g, '-')}-production`,
      ['Date', 'Died', 'Feed (bags)', 'Feed vs expected %', 'Eggs', 'Laying rate %', 'Medication', 'Recorded by'],
      entries.map((e) => [e.iso, e.died, e.feedBags.toFixed(2), e.feedVsExpected?.toFixed(1), e.eggs, e.layingRate?.toFixed(1), e.medication, e.recordedBy]),
    )
  }

  return (
    <Card>
      <CardHeader
        title="Daily entries · last 30 days"
        meta={<span className="type-body-sm text-fg-tertiary">{entries.length} entries</span>}
        action={{ label: 'Export', onClick: exportRows }}
      />
      {entries.length ? (
        <Table columns={entryColumns(m.thresholdBirds, m.typicalMax)} rows={entries} rowKey={(e) => e.iso} />
      ) : (
        <p className="px-5 pb-6 type-body-md text-fg-tertiary">No entries in the last 30 days.</p>
      )}
    </Card>
  )
}

type SaleRow = { id: number; date: string; ref: string; product: string; qty: string; price: number; total: number; buyer: string; status: string }

const saleColumns: Column<SaleRow>[] = [
  { key: 'date', header: 'Date', width: 110, render: (s) => <TextCell tone="primary">{weekdayDm(s.date)}</TextCell> },
  { key: 'ref', header: 'Receipt', width: 100, render: (s) => <TextCell>{s.ref}</TextCell> },
  { key: 'buyer', header: 'Customer', render: (s) => <TextCell>{s.buyer}</TextCell> },
  { key: 'product', header: 'Product', width: 180, render: (s) => <TextCell>{s.product}</TextCell> },
  { key: 'qty', header: 'Qty', align: 'right', width: 90, render: (s) => <NumberCell>{s.qty}</NumberCell> },
  { key: 'price', header: 'Price', align: 'right', width: 110, render: (s) => <NumberCell>{formatNaira(s.price)}</NumberCell> },
  { key: 'total', header: 'Total', align: 'right', width: 130, render: (s) => <NumberCell>{formatNaira(s.total)}</NumberCell> },
  { key: 'status', header: 'Status', width: 110, render: (s) => <TextCell tone={s.status === 'Approved' ? 'secondary' : 'info'}>{s.status}</TextCell> },
]

function SalesTab({ penId }: { penId: number }) {
  const { history, catalog } = useTrade()
  // This pen's portion of each sale split by pen: its quantity × the sale price.
  const rows: SaleRow[] = history.saleAllocations
    .filter((a) => a.pen_id === penId)
    .flatMap((a) => {
      const s = history.sales.find((x) => x.id === a.sale_id)
      if (!s) return []
      const product = catalog.products.find((p) => p.id === s.product_id)
      const qty = Number(a.quantity)
      const whole = qty === Number(s.quantity) ? '' : ` of ${formatNumber(Number(s.quantity))}`
      return {
        id: s.id,
        date: s.sold_on,
        ref: s.ref,
        product: product?.name ?? '—',
        qty: `${formatNumber(qty)}${whole} ${product?.unit ?? ''}`.trim(),
        price: Number(s.unit_price),
        total: qty * Number(s.unit_price),
        buyer: catalog.customers.find((c) => c.id === s.customer_id)?.name ?? s.buyer_name ?? 'One-off buyer',
        status: s.approval === 'approved' ? 'Approved' : 'Needs approval',
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  const total = rows.filter((r) => r.status === 'Approved').reduce((n, r) => n + r.total, 0)

  return (
    <Card>
      <CardHeader title="Sales from this pen" info="This pen’s portions of sales: its quantity × the sale price. The total counts approved sales only." meta={<span className="type-body-sm text-fg-tertiary">{rows.length ? `${rows.length} sales · ${formatNaira(total)} approved` : 'Since records began'}</span>} />
      {rows.length ? (
        <Table columns={saleColumns} rows={rows} rowKey={(r) => String(r.id)} />
      ) : (
        <p className="px-5 pb-2 type-body-md text-fg-tertiary">No sales have been split to this pen yet.</p>
      )}
      <p className="px-5 pt-3 pb-5 type-body-sm text-fg-tertiary">
        Sales not split by pen are auto-split: Costs & profit shares their value across pens by eggs collected.
      </p>
    </Card>
  )
}

type DoseRow = { id: number; date: string; medication: string; qty: string; mode: string; purpose: string; by: string; clear: string | null }

const doseColumns: Column<DoseRow>[] = [
  { key: 'date', header: 'Date', width: 110, render: (d) => <TextCell tone="primary">{weekdayDm(d.date)}</TextCell> },
  { key: 'med', header: 'Medication', render: (d) => <TextCell>{d.medication}</TextCell> },
  { key: 'qty', header: 'Quantity', align: 'right', width: 110, render: (d) => <NumberCell>{d.qty}</NumberCell> },
  { key: 'mode', header: 'Given in', width: 120, render: (d) => <TextCell>{d.mode}</TextCell> },
  { key: 'purpose', header: 'Purpose', width: 120, render: (d) => <TextCell>{d.purpose}</TextCell> },
  { key: 'clear', header: 'Withdrawal ends', width: 150, render: (d) => (d.clear ? <TextCell>{d.clear}</TextCell> : <TextCell tone="tertiary">None</TextCell>) },
  { key: 'by', header: 'Recorded by', width: 140, render: (d) => <TextCell>{d.by}</TextCell> },
]

function MedicationTab({ penId }: { penId: number }) {
  const { history, catalog } = useTrade()
  const meds = new Map(catalog.medications.map((m) => [m.id, m]))
  const today = todayISO()
  const w = withdrawals(history, catalog, today).find((x) => x.penId === penId)
  const rows: DoseRow[] = history.medLines
    .filter((l) => l.penId === penId)
    .map((l) => {
      const m = meds.get(l.medicationId)
      const days = m?.withdrawal_days ?? 0
      return {
        id: l.id,
        date: l.date,
        medication: m?.name ?? '—',
        qty: `${formatNumber(l.quantity)} ${m?.stock_unit ?? ''}`.trim(),
        mode: modeLabel(l.mode),
        purpose: l.purpose.charAt(0).toUpperCase() + l.purpose.slice(1),
        by: l.recordedBy,
        clear: days ? `${dayMonth(addDays(l.date, days + 1))}${addDays(l.date, days + 1) > today ? '' : ' · cleared'}` : null,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)

  return (
    <>
      {w ? (
        <Alert tone="warning" title={`In withdrawal until ${dayMonth(w.clearFrom)} — don’t sell eggs or birds from this pen`}>
          Last dose of {w.medication} on {dayMonth(w.lastDose)}; {w.days}-day withdrawal. Day {w.dayOf} of {w.days}.
        </Alert>
      ) : (
        <Alert tone="success" title="No withdrawal active">
          Eggs and birds from this pen can be sold.
        </Alert>
      )}
      <Card>
        <CardHeader title="Medication given" meta={<span className="type-body-sm text-fg-tertiary">{rows.length} doses since records began</span>} />
        {rows.length ? (
          <Table columns={doseColumns} rows={rows} rowKey={(r) => String(r.id)} />
        ) : (
          <p className="px-5 pb-6 type-body-md text-fg-tertiary">No medication recorded for this pen.</p>
        )}
      </Card>
    </>
  )
}

const COST_PERIODS = ['This month', 'Last month', 'Flock to date'] as const

function CostsTab({ penId }: { penId: number }) {
  const { history, catalog } = useTrade()
  const [which, setWhich] = useState<(typeof COST_PERIODS)[number]>('This month')
  const { flock } = penFlock(history, penId)
  const today = todayISO()
  const range: Range =
    which === 'This month'
      ? period('month', today)
      : which === 'Last month'
        ? period('last-month', today)
        : { from: flock && flock.placed_on > history.since ? flock.placed_on : history.since, to: flock?.closed_on ?? today, label: 'Flock to date' }
  const m = penMoney(history, catalog, range).find((x) => x.penId === penId)
  const cost = m ? penCost(m) : 0
  const margin = m ? m.revenue - cost : 0
  const crates = m ? m.eggs / farmSettings.eggsPerCrate : 0
  const birdDays = m?.birdDays ?? 0
  const lines: [string, number, string][] = m
    ? [
        ['Feed', m.feed, explain.feedCost()],
        ['Medication', m.medication, explain.medicationCost()],
        ['Birds', m.birds, explain.birdCost()],
        ['Pen expenses', m.direct, explain.penExpenses()],
        ['Share of farm costs', m.overhead, explain.overheadShare()],
      ]
    : []

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="Period" options={COST_PERIODS} value={which} onChange={setWhich} />
        <span className="type-body-sm text-fg-tertiary">
          {dayMonth(range.from)} – {dayMonth(range.to)}
          {which === 'Flock to date' && flock && flock.placed_on < history.since ? ' · records loaded from this date' : ''}
        </span>
      </div>
      <PartialCostsNote />
      {!m ? (
        <Card className="items-center p-12">
          <p className="type-body-md text-fg-tertiary">No sales or costs for this pen in this period.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <Card className="min-w-0 flex-1 gap-1 px-5 pt-4 pb-5">
            <h2 className="pb-2 type-h3 text-fg-primary">Costs & profit · {range.label}</h2>
            <KeyValueRow label="Sales" calculated={explain.penRevenue()}>
              {formatNaira(m.revenue)}
            </KeyValueRow>
            {lines.map(([label, value, how]) => (
              <KeyValueRow key={label} label={label} calculated={how}>
                − {formatNaira(Math.round(value))}
              </KeyValueRow>
            ))}
            <hr className="my-2 border-line-subtle" />
            <p className="flex items-baseline">
              <span className="flex flex-1 items-center gap-2 type-label-md text-fg-primary">
                Margin
                <InfoTip label="Margin">{explain.margin()}</InfoTip>
              </span>
              <span className={margin < 0 ? 'type-numeric-md text-fg-danger' : 'type-numeric-md text-fg-success'}>
                {margin < 0 ? '−' : ''}
                {formatNaira(Math.abs(Math.round(margin)))}
              </span>
            </p>
          </Card>
          <Card className="w-full shrink-0 lg:w-[400px] gap-1 px-5 pt-4 pb-5">
            <h2 className="pb-2 type-h3 text-fg-primary">Unit costs</h2>
            {crates > 0 && (
              <>
                <KeyValueRow label="Eggs collected" calculated={explain.cratesCollected()}>
                  {formatNumber(Math.round(crates))} crates
                </KeyValueRow>
                <KeyValueRow label="Cost per crate" calculated="All this pen’s costs in the period ÷ crates collected.">
                  {formatNaira(Math.round(cost / crates))}
                </KeyValueRow>
                <KeyValueRow label="Feed per crate" calculated={explain.feedPerCrate()}>
                  {(m.feedKg / crates).toFixed(1)} kg
                </KeyValueRow>
              </>
            )}
            <KeyValueRow label="Bird-days" calculated="Birds at the start of each day, added up over the period (1,000 birds for 7 days = 7,000).">
              {formatNumber(birdDays)}
            </KeyValueRow>
            <KeyValueRow label="Cost per bird per day" calculated={explain.costPerBirdDay()}>
              {birdDays ? `₦ ${(cost / birdDays).toFixed(1)}` : '—'}
            </KeyValueRow>
            <KeyValueRow label="Feed per bird per day" calculated={explain.feedPerBirdDay()}>
              {birdDays ? `${((m.feedKg * 1000) / birdDays).toFixed(0)} g` : '—'}
            </KeyValueRow>
            {inRange(today, range) && <p className="pt-2 type-body-sm text-fg-tertiary">Figures to today; the period isn’t finished.</p>}
          </Card>
        </div>
      )}
    </>
  )
}
