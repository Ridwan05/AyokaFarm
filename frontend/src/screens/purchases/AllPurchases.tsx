'use client'

import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Tabs } from '../../components/ui/Tabs'
import { totalOf } from '../../data/purchases'
import { useTrade } from '../../data/tradeContext'
import { PurchaseOverlays, type PurchaseOverlay } from '../../features/purchases/PurchaseOverlays'
import { PurchasesTable } from '../../features/purchases/PurchasesTable'
import { PURCHASE_CSV_HEADER, purchaseCsvRows } from '../../features/purchases/purchaseView'
import { dayMonth } from '../../data/metrics'
import { farmSettings } from '../../data/farmSettings'
import { downloadCsv } from '../../lib/export'

const TABS = ['All', 'Feed', 'Birds', 'Medication'] as const

export default function AllPurchases() {
  const trade = useTrade()
  const { purchases } = trade
  const [tab, setTab] = useState<(typeof TABS)[number]>('All')
  const [overlay, setOverlay] = useState<PurchaseOverlay>(null)
  const rows = tab === 'All' ? purchases : purchases.filter((p) => p.kind === tab)
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
      <Card>
        <CardHeader
          title={farmSettings.goLiveDate ? `Since go-live · ${dayMonth(farmSettings.goLiveDate)} ${farmSettings.goLiveDate.slice(0, 4)}` : 'All purchases'}
          meta={
            <span className="type-body-sm text-fg-tertiary">
              {rows.length} purchases · ₦{(total / 1e6).toFixed(1)}M
            </span>
          }
        />
        <PurchasesTable
          purchases={rows}
          onOpen={(p) => setOverlay({ kind: 'detail', ref: p.ref })}
          onPay={(p) => setOverlay({ kind: 'pay', ref: p.ref })}
        />
      </Card>
      <PurchaseOverlays overlay={overlay} setOverlay={setOverlay} />
    </>
  )
}
