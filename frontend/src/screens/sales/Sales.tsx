'use client'

import { Check, CircleCheck, Clock, Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { useToast } from '../../components/ui/toastContext'
import { amountOf, products } from '../../data/sales'
import { nowHM, todayISO, weekdayDayMonth } from '../../data/metrics'
import { approvers, salesIn, salesKpis, spanLabel, weekSpans } from '../../data/moneyKpis'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { SALES_CSV_HEADER, saleCsvRows, useSalesFilter } from '../../features/sales/filters'
import { SalesFilterBar } from '../../features/sales/SalesFilterBar'
import { SaleOverlays, type SaleOverlay } from '../../features/sales/SaleOverlays'
import { SalesTable } from '../../features/sales/SalesTable'
import { canApprove } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { formatNumber } from '../../lib/format'

export default function Sales() {
  const currentUser = useCurrentUser()
  const trade = useTrade()
  const { sales, customers, approveSale, rejectSale } = trade
  const toast = useToast()
  const f = useSalesFilter(sales, customers, 'This week')
  const [overlay, setOverlay] = useState<SaleOverlay>(null)
  const pending = sales.filter((s) => s.pendingApproval)
  const approved = sales.find((s) => s.approvedAt)
  const first = pending[0]
  const me = currentUser.name.split(' ')[0]
  const approver = canApprove(currentUser.role)
  const weekCount = salesIn(sales, weekSpans().now).length

  const describe = (receipt: string) => {
    const s = sales.find((x) => x.receipt === receipt)!
    const p = products.find((x) => x.id === s.productId)!
    const c = customers.find((x) => x.id === s.customerId)
    return { s, p, c, line: `${c?.name ?? 'One-off buyer'} · ${s.qty} ${p.unit} at ₦${formatNumber(s.price)}` }
  }

  return (
    <>
      <PageHeader
        eyebrow={['Trade', 'Sales']}
        title="Sales"
        description={`${weekdayDayMonth(todayISO())}, ${nowHM()} · ${weekCount} sale${weekCount === 1 ? '' : 's'} this week. Prices are set at each sale; anything below the minimum waits for your approval.`}
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

      {first ? (
        (() => {
          const d = describe(first.receipt)
          return (
            <Alert
              tone="warning"
              icon={Clock}
              title={approver ? `${pending.length} sale${pending.length > 1 ? 's are' : ' is'} waiting for your approval` : `Waiting for approval from ${approvers(trade)}`}
              actions={
                !approver ? (
                  <Button onClick={() => setOverlay({ kind: 'detail', receipt: first.receipt })}>View sale</Button>
                ) : (
                <>
                  <Button
                    onClick={async () => {
                      if (!(await rejectSale(first.receipt))) return
                      toast(`${first.receipt} rejected`)
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    leadingIcon={Check}
                    onClick={async () => {
                      if (!(await approveSale(first.receipt, me))) return
                      toast(`${first.receipt} approved`)
                    }}
                  >
                    Approve
                  </Button>
                </>
                )
              }
            >
              {d.line} (minimum ₦{formatNumber(d.p.minPrice)}) · ₦{formatNumber(amountOf(d.s))} ·{' '}
              {approver
                ? `requested by ${d.s.recordedBy.split(' ')[0]} at ${d.s.date.split(' ')[1]}. The receipt is held until you decide.`
                : `sent by you at ${d.s.date.split(' ')[1]}. The receipt is held until it’s approved.`}
            </Alert>
          )
        })()
      ) : approved ? (
        (() => {
          const d = describe(approved.receipt)
          return (
            <Alert tone="success" icon={CircleCheck} compact title={`${approved.receipt} approved at ${approved.approvedAt}`}>
              {d.line} · ₦{formatNumber(amountOf(d.s))}. {d.s.recordedBy.split(' ')[0]} has been told and can send the receipt now.
            </Alert>
          )
        })()
      ) : null}

      <SalesFilterBar f={f} />

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {salesKpis(trade).map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <Card>
        <CardHeader
          title={f.period}
          meta={<span className="type-body-sm text-fg-tertiary">{spanLabel(f.range)}</span>}
          action={{ label: 'All sales', to: '/sales/all' }}
        />
        <SalesTable
          sales={f.visible}
          onOpen={(s) => setOverlay({ kind: 'detail', receipt: s.receipt })}
          onRecordPayment={(s) => setOverlay({ kind: 'payment', receipt: s.receipt })}
          onEdit={(s) => setOverlay({ kind: 'edit', receipt: s.receipt })}
          onVoid={(s) => setOverlay({ kind: 'void', receipt: s.receipt })}
        />
        {f.visible.length === 0 && <p className="px-5 py-6 type-body-md text-fg-tertiary">No sales match these filters.</p>}
      </Card>

      <SaleOverlays overlay={overlay} setOverlay={setOverlay} />
    </>
  )
}
