'use client'

import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { amountOf } from '../../data/sales'
import { useTrade } from '../../data/tradeContext'
import { useSalesFilter } from '../../features/sales/filters'
import { SalesFilterBar } from '../../features/sales/SalesFilterBar'
import { SaleOverlays, type SaleOverlay } from '../../features/sales/SaleOverlays'
import { SalesTable } from '../../features/sales/SalesTable'

export default function AllSales() {
  const { sales, customers } = useTrade()
  const f = useSalesFilter(sales, customers, 'This month')
  const [overlay, setOverlay] = useState<SaleOverlay>(null)
  const total = f.visible.reduce((n, s) => n + amountOf(s), 0)

  return (
    <>
      <PageHeader
        backTo="/sales"
        eyebrow={['Trade', 'Sales', 'All sales']}
        title="All sales"
        description="Every sale with its receipt, newest first. Click a sale for its details, or ··· for more."
        actions={
          <>
            <Button leadingIcon={Download}>Export</Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setOverlay({ kind: 'record' })}>
              Record sale
            </Button>
          </>
        }
      />
      <SalesFilterBar f={f} />

      <Card>
        <CardHeader
          title="October · 01–09 Oct"
          meta={
            <span className="type-body-sm text-fg-tertiary">
              {f.visible.length} sales · ₦{(total / 1e6).toFixed(2)}M
            </span>
          }
        />
        <SalesTable
          sales={f.visible}
          onOpen={(s) => setOverlay({ kind: 'detail', receipt: s.receipt })}
          onRecordPayment={(s) => setOverlay({ kind: 'payment', receipt: s.receipt })}
        />
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 type-body-sm text-fg-tertiary">Showing all {f.visible.length} sales in October</span>
          <Button disabled>
            Previous
          </Button>
          <Button disabled>
            Next
          </Button>
        </div>
      </Card>

      <SaleOverlays overlay={overlay} setOverlay={setOverlay} />
    </>
  )
}
