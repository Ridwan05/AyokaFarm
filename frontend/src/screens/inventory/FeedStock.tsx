'use client'

import { Scale, Truck } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { InfoTip } from '../../components/ui/InfoTip'
import { explain } from '../../data/explain'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { feedTypes, type FeedType } from '../../data/inventory'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { AskReorderModal } from '../../features/stock/AskReorderModal'
import { ReceiveDeliveryDrawer } from '../../features/stock/ReceiveDeliveryDrawer'
import { isAttendant } from '../../lib/access'
import { cn } from '../../lib/cn'
import { downloadCsv } from '../../lib/export'
import { formatNumber } from '../../lib/format'
import { InventoryTabs, LedgerNote } from './InventoryTabs'
import { Presence } from '../../components/ui/Overlay'
import { farmSettings } from '../../data/farmSettings'
import { addDays, dayMonth, todayISO, weekdayDm } from '../../data/metrics'
import { PendingCounts } from '../../features/stock/PendingCounts'
import { dailyLedger, feedSource, people, reorderSuggestion } from '../../data/stockMetrics'

const dash = <NumberCell tone="muted">—</NumberCell>

type LedgerRow = ReturnType<typeof dailyLedger>[number] & { source: string }

const columns: Column<LedgerRow>[] = [
  { key: 'date', header: 'Date', width: 130, render: (r) => <TextCell tone="primary">{weekdayDm(r.date)}</TextCell> },
  { key: 'opening', header: 'Opening', align: 'right', width: 125, render: (r) => <NumberCell>{formatNumber(r.opening)}</NumberCell> },
  { key: 'received', header: 'Received', align: 'right', width: 125, render: (r) => (r.received ? <NumberCell tone="success">+{formatNumber(r.received)}</NumberCell> : dash) },
  { key: 'used', header: 'Used', align: 'right', width: 125, render: (r) => (r.used ? <NumberCell>{formatNumber(r.used)}</NumberCell> : dash) },
  {
    key: 'adjust',
    header: 'Adjust',
    align: 'right',
    width: 125,
    render: (r) => (r.adjusted ? <NumberCell tone="warning">{r.adjusted > 0 ? `+${formatNumber(r.adjusted)}` : `−${formatNumber(-r.adjusted)}`}</NumberCell> : dash),
  },
  { key: 'closing', header: 'Closing', align: 'right', width: 125, render: (r) => <NumberCell tone="strong">{formatNumber(r.closing)}</NumberCell> },
  { key: 'source', header: 'Source', render: (r) => <TextCell>{r.source}</TextCell> },
]

export default function FeedStock() {
  const router = useRouter()
  const user = useCurrentUser()
  const { stockOf, history, catalog } = useTrade()
  const keeper = user.role === 'store-keeper'
  // Pen attendants can look, not act (BRD §4: Inventory V).
  const readOnly = isAttendant(user.role)
  const [selected, setSelected] = useState(feedTypes[0]?.name ?? '')
  const [showReorder, setShowReorder] = useState(true)
  const [overlay, setOverlay] = useState<'receive' | 'reorder' | null>(null)
  const types = feedTypes.map((f) => ({ ...f, bags: stockOf(f.name) }))
  const feed = types.find((f) => f.name === selected) ?? types[0]
  const feedId = catalog.feedTypes.find((f) => f.name === feed?.name)?.id
  const today = todayISO()
  const rows: LedgerRow[] = feedId
    ? dailyLedger(history, (d) => d.item === 'feed' && d.feedTypeId === feedId, addDays(today, -13), today).map((r) => ({ ...r, source: feedSource(history, catalog, feedId, r.date) }))
    : []
  const suggestion = reorderSuggestion(history, catalog, types)
  const low = suggestion && suggestion.daysOfCover <= farmSettings.lowStockDays ? suggestion : null
  const { manager, owner } = people(catalog)
  const from = suggestion?.supplier ? ` from ${suggestion.supplier}` : ''
  const about = low?.days ? ` (≈${low.days} days)` : ''

  const exportLedger = () =>
    downloadCsv(
      `feed-ledger-${feed.name.toLowerCase().replace(/\W+/g, '-')}`,
      ['Date', 'Opening (bags)', 'Received', 'Used', 'Adjust', 'Closing', 'Source'],
      rows.map((r) => [r.date, r.opening, r.received, r.used, r.adjusted, r.closing, r.source]),
    )

  return (
    <>
      <PageHeader
        eyebrow={keeper ? ['Inventory', 'Feed'] : ['Operate', 'Inventory']}
        title="Feed stock"
        description="A daily ledger per feed type, calculated from deliveries and pen entries — counted, never typed."
        actions={
          readOnly ? undefined : (
            <>
              <Button leadingIcon={Scale} onClick={() => router.push('/inventory/count')}>
                Stock count
              </Button>
              {keeper ? (
                <Button variant="primary" leadingIcon={Truck} onClick={() => setOverlay('receive')}>
                  Receive delivery
                </Button>
              ) : (
                <Button variant="primary" leadingIcon={Truck} onClick={() => router.push('/purchases')}>
                  Record purchase
                </Button>
              )}
            </>
          )
        }
      />
      <PendingCounts only="feed" />

      <InventoryTabs />

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {types.map((f) => (
          <FeedCard key={f.name} feed={f} selected={f.name === feed?.name} onSelect={() => setSelected(f.name)} />
        ))}
      </div>

      {showReorder && !readOnly && low && (
        <Alert
          tone="warning"
          title={`Reorder ${low.feed} — ${low.daysOfCover} days of cover left`}
          action={
            keeper ? (
              <AlertAction onClick={() => setOverlay('reorder')}>Ask {manager} to reorder</AlertAction>
            ) : (
              <AlertAction onClick={() => router.push('/purchases')}>Create purchase</AlertAction>
            )
          }
          onDismiss={() => setShowReorder(false)}
        >
          {keeper
            ? `Suggested: ${low.bags} bags${about}${from}. ${manager.charAt(0).toUpperCase() + manager.slice(1)} decides and ${owner} places the order; the bags appear here when you receive them.`
            : `Suggested order: ${low.bags} bags${about}${from}${low.lastPrice !== null ? ` · last price ₦${formatNumber(low.lastPrice)} per bag on ${dayMonth(low.lastDate!)}` : ''}. Saving the purchase adds the bags here automatically.`}{' '}
          <InfoTip label="Suggested order">
            {explain.reorderSuggestion()} Supplier and price are from the last purchase of this feed.
          </InfoTip>
        </Alert>
      )}

      {feed && (
        <Card>
          <CardHeader
            title={`${feed.name} ledger`}
            meta={<span className="type-body-sm text-fg-tertiary">Bags · last 14 days · closing = opening + received − used ± count adjustment</span>}
            action={{ label: 'Export', onClick: exportLedger }}
          />
          <Table columns={columns} rows={rows} rowKey={(r) => r.date} />
          <LedgerNote>
            Opening, received and used are calculated. Only a physical count can adjust stock — and it always needs a reason (FR-INV-2).
          </LedgerNote>
        </Card>
      )}

      <Presence>{overlay === 'receive' && <ReceiveDeliveryDrawer onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{overlay === 'reorder' && <AskReorderModal onClose={() => setOverlay(null)} />}</Presence>
    </>
  )
}

function FeedCard({ feed, selected, onSelect }: { feed: FeedType; selected: boolean; onSelect: () => void }) {
  const inUse = feed.daysOfCover !== null
  const low = inUse && feed.daysOfCover! <= farmSettings.lowStockDays
  return (
    // A div acting as a button, so the info icon inside can be its own button.
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onSelect()
      }}
      className={cn(
        'flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-2 rounded-xl bg-surface px-5 py-4 text-left',
        selected ? 'border-[1.5px] border-line-brand' : 'border border-line hover:border-line-strong',
      )}
    >
      <span className="flex w-full items-center gap-1.5 type-label-md text-fg-secondary">
        <span className="min-w-0 flex-1 truncate">{feed.name}</span>
        <InfoTip label={`${feed.name} in store`}>
          Bags = {explain.stockOnHand().charAt(0).toLowerCase() + explain.stockOnHand().slice(1)} {explain.daysOfCover()}
        </InfoTip>
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="type-display-lg text-fg-primary">{formatNumber(feed.bags)}</span>
        <span className="type-body-md text-fg-tertiary">bags</span>
      </span>
      <Badge dot tone={!inUse ? 'neutral' : low ? 'warning' : 'success'}>
        {inUse ? `${feed.daysOfCover} days of cover` : 'Not in use'}
      </Badge>
      <span className="type-body-sm text-fg-tertiary">
        {inUse ? `Reorder at ${feed.reorderAt} bags · ${feed.bagsPerDay} bags/day` : feed.note}
      </span>
    </div>
  )
}
