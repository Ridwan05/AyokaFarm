'use client'

import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { LinkTabs } from '../../components/ui/Tabs'
import { purchaseKpis } from '../../data/moneyKpis'
import type { PurchaseKind } from '../../data/purchases'
import { useTrade } from '../../data/tradeContext'
import { PurchaseOverlays, type PurchaseOverlay } from '../../features/purchases/PurchaseOverlays'
import { PurchasesTable } from '../../features/purchases/PurchasesTable'
import { PURCHASE_CSV_HEADER, purchaseCsvRows } from '../../features/purchases/purchaseView'
import { downloadCsv } from '../../lib/export'
import { formatDayMon } from '../../lib/format'

const KINDS: Record<string, PurchaseKind> = { feed: 'Feed', birds: 'Birds', medication: 'Medication' }
/** How many recent purchases the "All" overview shows. */
const RECENT = 7

const purchaseTabs = (base: string) => [
  { label: 'All', to: base },
  { label: 'Feed', to: `${base}/feed` },
  { label: 'Birds', to: `${base}/birds` },
  { label: 'Medication', to: `${base}/medication` },
]

export default function Purchases() {
  const { kind: kindParam } = useParams<{ kind?: string }>()
  const kind = kindParam ? KINDS[kindParam] : undefined
  const trade = useTrade()
  const { purchases } = trade
  const [overlay, setOverlay] = useState<PurchaseOverlay>(null)

  const rows = kind ? purchases.filter((p) => p.kind === kind) : purchases.slice(0, RECENT)
  const oldest = rows[rows.length - 1]

  return (
    <>
      <PageHeader
        eyebrow={kind ? ['Trade', 'Purchases', kind] : ['Trade', 'Purchases']}
        title="Purchases"
        description="Feed, birds and medication bought. Saving a purchase updates stock and the supplier’s balance, so nothing is typed twice."
        actions={
          <>
            <Button
              leadingIcon={Download}
              onClick={() =>
                downloadCsv('purchases', PURCHASE_CSV_HEADER, purchaseCsvRows(kind ? rows : purchases, (id) => trade.suppliers.find((s) => s.id === id)?.name ?? '', trade.purchasePaid))
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

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {purchaseKpis(trade, kind).map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <Card>
        <CardHeader
          title={kind ? `${kind === 'Birds' ? 'Bird' : kind} purchases` : 'Recent purchases'}
          meta={<span className="type-body-sm text-fg-tertiary">Newest first{kind && oldest ? ` · since ${formatDayMon(oldest.date)}` : ''}</span>}
          action={{ label: 'All purchases', to: '/purchases/all' }}
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
