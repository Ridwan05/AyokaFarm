'use client'

import { CalendarDays, Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Select } from '../../components/ui/Select'
import { Tabs } from '../../components/ui/Tabs'
import { inPeriod, PERIODS_OR_ALL, rangeOrAll, type PeriodOrAll } from '../../data/periods'
import { totalOf } from '../../data/purchases'
import { useTrade } from '../../data/tradeContext'
import { PurchaseOverlays, type PurchaseOverlay } from '../../features/purchases/PurchaseOverlays'
import { PurchasesTable } from '../../features/purchases/PurchasesTable'
import { PURCHASE_CSV_HEADER, purchaseCsvRows } from '../../features/purchases/purchaseView'
import { dayMonth } from '../../data/metrics'
import { farmSettings } from '../../data/farmSettings'
import { downloadCsv } from '../../lib/export'
import { InfoTip } from '../../components/ui/InfoTip'
import { explainMoney } from '../../data/explainMoney'
import { spanLabel } from '../../data/moneyKpis'

// Tabs filter in place here, unlike the overview's link tabs.
const TABS = ['All', 'Feed', 'Birds', 'Medication'] as const

/** Every purchase since go-live, filtered by type and period, with the actions from the Purchases overview. */
export default function AllPurchases() {
  const trade = useTrade()
  const { purchases } = trade
  const [tab, setTab] = useState<(typeof TABS)[number]>('All')
  const [overlay, setOverlay] = useState<PurchaseOverlay>(null)
  const [period, setPeriod] = useState<PeriodOrAll>('All time')
  const range = rangeOrAll(period)
  const rows = purchases.filter((p) => (tab === 'All' || p.kind === tab) && inPeriod(p.date, range))
  const total = rows.reduce((n, p) => n + totalOf(p), 0)

  return (
    <>
      <PageHeader
        backTo="/purchases"
        eyebrow={['Trade', 'Purchases', 'All purchases']}
        title="All purchases"
        description="Feed, birds and medication bought since go-live. Click a purchase for its details, or ··· for more."
        actions={
          <>
            <Button leadingIcon={Download} onClick={() => downloadCsv('purchases', PURCHASE_CSV_HEADER, purchaseCsvRows(rows, (id) => trade.suppliers.find((s) => s.id === id)?.name ?? '', trade.purchasePaid))}>
              Export
            </Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setOverlay({ kind: 'new' })}>
              New purchase
            </Button>
          </>
        }
      />
      <Tabs label="Purchase type" tabs={TABS} value={tab} onChange={setTab} />
      <div className="flex flex-wrap items-center gap-3">
        <Select label="Period" leadingIcon={CalendarDays} width={170} options={PERIODS_OR_ALL} value={period} onChange={setPeriod} />
      </div>
      <Card>
        <CardHeader
          title={range ? `${period} · ${spanLabel(range)}` : farmSettings.goLiveDate ? `Since go-live · ${dayMonth(farmSettings.goLiveDate)} ${farmSettings.goLiveDate.slice(0, 4)}` : 'All purchases'}
          meta={
            <span className="flex items-center gap-1.5 type-body-sm text-fg-tertiary">
              {rows.length} purchases · ₦{(total / 1e6).toFixed(1)}M
              <InfoTip label="Purchases total">{explainMoney.purchasesListTotal()}</InfoTip>
            </span>
          }
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
