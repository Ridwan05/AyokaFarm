'use client'

import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { amountOf } from '../../data/sales'
import { useTrade } from '../../data/tradeContext'
import { SALES_CSV_HEADER, saleCsvRows, useSalesFilter } from '../../features/sales/filters'
import { spanLabel } from '../../data/moneyKpis'
import { downloadCsv } from '../../lib/export'
import { SalesFilterBar } from '../../features/sales/SalesFilterBar'
import { SaleOverlays, type SaleOverlay } from '../../features/sales/SaleOverlays'
import { SalesTable } from '../../features/sales/SalesTable'
import { InfoTip } from '../../components/ui/InfoTip'
import { explainMoney } from '../../data/explainMoney'

const PAGE = 50

export default function AllSales() {
  const { sales, customers } = useTrade()
  const f = useSalesFilter(sales, customers, 'This month')
  const [overlay, setOverlay] = useState<SaleOverlay>(null)
  const total = f.visible.reduce((n, s) => n + amountOf(s), 0)
  // 50 a page keeps long periods quick to scroll and render.
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(f.visible.length / PAGE))
  const current = Math.min(page, pages - 1)
  const shown = f.visible.slice(current * PAGE, current * PAGE + PAGE)

  return (
    <>
      <PageHeader
        backTo="/sales"
        eyebrow={['Trade', 'Sales', 'All sales']}
        title="All sales"
        description="Every sale with its receipt, newest first. Click a sale for its details, or ··· for more."
        actions={
          <>
            <Button leadingIcon={Download} onClick={() => downloadCsv('sales', SALES_CSV_HEADER, saleCsvRows(f.visible, customers))}>
              Export
            </Button>
            <Button variant="primary" leadingIcon={Plus} onClick={() => setOverlay({ kind: 'record' })}>
              Record sale
            </Button>
          </>
        }
      />
      <SalesFilterBar f={f} />

      <Card>
        <CardHeader
          title={`${f.period} · ${spanLabel(f.range)}`}
          meta={
            <span className="flex items-center gap-1.5 type-body-sm text-fg-tertiary">
              {f.visible.length} sales · ₦{(total / 1e6).toFixed(2)}M
              <InfoTip label="Sales total">{explainMoney.salesListTotal()}</InfoTip>
            </span>
          }
        />
        <SalesTable
          sales={shown}
          onOpen={(s) => setOverlay({ kind: 'detail', receipt: s.receipt })}
          onRecordPayment={(s) => setOverlay({ kind: 'payment', receipt: s.receipt })}
          onEdit={(s) => setOverlay({ kind: 'edit', receipt: s.receipt })}
          onVoid={(s) => setOverlay({ kind: 'void', receipt: s.receipt })}
        />
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 type-body-sm text-fg-tertiary">
            {f.visible.length > PAGE ? `${current * PAGE + 1}–${Math.min(f.visible.length, (current + 1) * PAGE)} of ${f.visible.length} sales` : `Showing all ${f.visible.length} sales`} · {f.period.toLowerCase()}
          </span>
          <Button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <Button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </Button>
        </div>
      </Card>

      <SaleOverlays overlay={overlay} setOverlay={setOverlay} />
    </>
  )
}
