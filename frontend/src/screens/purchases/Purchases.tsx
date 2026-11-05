'use client'

import { CalendarDays, Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { Select } from '../../components/ui/Select'
import { LinkTabs } from '../../components/ui/Tabs'
import { purchaseKpis } from '../../data/moneyKpis'
import { inPeriod, PERIODS_OR_ALL, rangeOrAll, type PeriodOrAll } from '../../data/periods'
import type { PurchaseKind } from '../../data/purchases'
import { useTrade } from '../../data/tradeContext'
import { PurchaseOverlays, type PurchaseOverlay } from '../../features/purchases/PurchaseOverlays'
import { PurchasesTable } from '../../features/purchases/PurchasesTable'
import { ReorderRequests } from '../../features/stock/ReorderRequests'
import { accessOf } from '../../lib/access'
import { useCurrentUser } from '../../data/sessionContext'
import { PURCHASE_CSV_HEADER, purchaseCsvRows } from '../../features/purchases/purchaseView'
import { downloadCsv } from '../../lib/export'
import { formatDayMon } from '../../lib/format'

/** URL segment (/purchases/feed) → purchase kind. */
const KINDS: Record<string, PurchaseKind> = { feed: 'Feed', birds: 'Birds', medication: 'Medication' }
/** How many recent purchases the "All" overview shows. */
const RECENT = 7

/** The All · Feed · Birds · Medication tabs, as links under a base path. */
const purchaseTabs = (base: string) => [
  { label: 'All', to: base },
  { label: 'Feed', to: `${base}/feed` },
  { label: 'Birds', to: `${base}/birds` },
  { label: 'Medication', to: `${base}/medication` },
]

/**
 * Purchases overview (/purchases) or one type (/purchases/feed and so on): KPIs, the store
 * keeper's reorder requests for the buyer to decide, and recent purchases.
 */
export default function Purchases() {
  const { kind: kindParam } = useParams<{ kind?: string }>()
  const kind = kindParam ? KINDS[kindParam] : undefined
  const trade = useTrade()
  const { purchases } = trade
  const [overlay, setOverlay] = useState<PurchaseOverlay>(null)
  const user = useCurrentUser()
  // Whoever can buy for the whole farm decides reorder requests (the database checks the same).
  const buyer = accessOf(user, 'purchases', 'add') === 'all'

  const [period, setPeriod] = useState<PeriodOrAll>('All time')
  const range = rangeOrAll(period)
  const dated = purchases.filter((p) => inPeriod(p.date, range))
  // One type shows all its purchases; the overview over All time shows only the latest few. Purchases are newest first.
  const rows = kind ? dated.filter((p) => p.kind === kind) : range ? dated : dated.slice(0, RECENT)
  const oldest = rows[rows.length - 1]

  return (
    <>
      <PageHeader
        eyebrow={kind ? ['Trade', 'Purchases', kind] : ['Trade', 'Purchases']}
        title="Purchases"
        description="Feed, birds and medication bought. Saving a purchase updates stock and the supplier’s balance, so nothing is typed twice."
        actions={
          <>
            {/* On the overview, Export gives every purchase in the period, not just the recent ones shown. */}
            <Button
              leadingIcon={Download}
              onClick={() =>
                downloadCsv('purchases', PURCHASE_CSV_HEADER, purchaseCsvRows(kind ? rows : dated, (id) => trade.suppliers.find((s) => s.id === id)?.name ?? '', trade.purchasePaid))
              }
            >
              Export
            </Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setOverlay({ kind: 'new' })}>
              New purchase
            </Button>
          </>
        }
      />
      <LinkTabs label="Purchase type" tabs={purchaseTabs('/purchases')} />
      <div className="flex flex-wrap items-center gap-3">
        <Select label="Period" leadingIcon={CalendarDays} width={170} options={PERIODS_OR_ALL} value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {purchaseKpis(trade, kind).map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* Reorder requests are for feed and medication, so the Birds tab doesn't show them. */}
      {buyer && (!kind || kind !== 'Birds') && <ReorderRequests canDecide onRecordPurchase={() => setOverlay({ kind: 'new' })} />}

      <Card>
        <CardHeader
          title={`${kind ? `${kind === 'Birds' ? 'Bird' : kind} purchases` : range ? 'Purchases' : 'Recent purchases'}${range ? ` · ${period.toLowerCase()}` : ''}`}
          meta={<span className="type-body-sm text-fg-tertiary">Newest first{kind && oldest ? ` · since ${formatDayMon(oldest.date)}` : ''}</span>}
          action={{ label: 'All purchases', to: '/purchases/all' }}
        />
        <PurchasesTable
          purchases={rows}
          onOpen={(p) => setOverlay({ kind: 'detail', ref: p.ref })}
          onPay={(p) => setOverlay({ kind: 'pay', ref: p.ref })}
          onEdit={(p) => setOverlay({ kind: 'edit', ref: p.ref })}
          onVoid={(p) => setOverlay({ kind: 'void', ref: p.ref })}
        />
      </Card>

      <PurchaseOverlays overlay={overlay} setOverlay={setOverlay} />
    </>
  )
}
