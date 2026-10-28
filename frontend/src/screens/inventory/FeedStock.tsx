'use client'

import { Scale, Truck } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '../../components/layout/PageHeader'
import { Alert, AlertAction } from '../../components/ui/Alert'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { feedTypes, LOW_COVER_DAYS, reorderSuggestion, withBalances, type Balanced, type FeedType, type Movement } from '../../data/inventory'
import { useToast } from '../../components/ui/toastContext'
import { useCurrentUser } from '../../data/sessionContext'
import { useTrade } from '../../data/tradeContext'
import { AskReorderModal } from '../../features/stock/AskReorderModal'
import { ReceiveDeliveryDrawer } from '../../features/stock/ReceiveDeliveryDrawer'
import { isAttendant } from '../../lib/access'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { InventoryTabs, LedgerNote } from './InventoryTabs'
import { Presence } from '../../components/ui/Overlay'

const dash = <NumberCell tone="muted">—</NumberCell>

const columns: Column<Balanced<Movement>>[] = [
  { key: 'date', header: 'Date', width: 130, render: (r) => <TextCell tone="primary">{r.date}</TextCell> },
  { key: 'opening', header: 'Opening', align: 'right', width: 125, render: (r) => <NumberCell>{r.opening}</NumberCell> },
  { key: 'received', header: 'Received', align: 'right', width: 125, render: (r) => (r.received ? <NumberCell tone="success">+{r.received}</NumberCell> : dash) },
  { key: 'used', header: 'Used', align: 'right', width: 125, render: (r) => (r.used ? <NumberCell>{r.used}</NumberCell> : dash) },
  {
    key: 'adjust',
    header: 'Adjust',
    align: 'right',
    width: 125,
    render: (r) => (r.adjust ? <NumberCell tone="warning">{r.adjust > 0 ? `+${r.adjust}` : `−${-r.adjust}`}</NumberCell> : dash),
  },
  { key: 'closing', header: 'Closing', align: 'right', width: 125, render: (r) => <NumberCell tone="strong">{r.closing}</NumberCell> },
  { key: 'source', header: 'Source', render: (r) => <TextCell>{r.source}</TextCell> },
]

export default function FeedStock() {
  const router = useRouter()
  const toast = useToast()
  const user = useCurrentUser()
  const { stockOf, stockMoves } = useTrade()
  const keeper = user.role === 'store-keeper'
  // Pen attendants can look, not act (BRD §4: Inventory V).
  const readOnly = isAttendant(user.role)
  const [selected, setSelected] = useState(feedTypes[0].name)
  const [showReorder, setShowReorder] = useState(true)
  const [overlay, setOverlay] = useState<'receive' | 'reorder' | null>(null)
  // Stock reflects deliveries and counts saved in this session.
  const types = feedTypes.map((f) => ({ ...f, bags: stockOf(f.name, f.bags) }))
  const feed = types.find((f) => f.name === selected)!
  const low = types.find((f) => f.name === reorderSuggestion.feed)!
  const sessionRows: Movement[] = stockMoves
    .filter((m) => m.item === feed.name)
    .map((m) => ({ date: 'Fri 09/10', received: m.type === 'received' ? m.qty : undefined, used: m.type === 'used' ? -m.qty : undefined, adjust: m.type === 'adjust' ? m.qty : undefined, source: m.source }))

  return (
    <>
      <PageHeader
        eyebrow={keeper ? ['Inventory', 'Feed'] : ['Operate', 'Inventory']}
        title="Feed stock"
        description="A daily ledger per feed type, calculated from deliveries and pen entries — counted, never typed."
        actions={
          readOnly ? undefined : (
          <>
            <Button leadingIcon={Scale} onClick={() => (keeper ? router.push('/inventory/count') : toast('Bayo runs the weekly count on Fridays'))}>
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
      <InventoryTabs />

      <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
        {types.map((f) => (
          <FeedCard key={f.name} feed={f} selected={f.name === selected} onSelect={() => setSelected(f.name)} />
        ))}
      </div>

      {showReorder && !readOnly && low.daysOfCover !== null && (
        <Alert
          tone="warning"
          title={`Reorder ${low.name} — ${low.daysOfCover} days of cover left`}
          action={
            keeper ? (
              <AlertAction onClick={() => setOverlay('reorder')}>Ask Emeka to reorder</AlertAction>
            ) : (
              <AlertAction onClick={() => router.push('/purchases')}>Create purchase</AlertAction>
            )
          }
          onDismiss={() => setShowReorder(false)}
        >
          {keeper
            ? `Suggested: ${reorderSuggestion.bags} bags (≈${reorderSuggestion.days} days) from ${reorderSuggestion.supplier}. Emeka decides and Adeola places the order; the bags appear here when you receive them.`
            : `Suggested order: ${reorderSuggestion.bags} bags (≈${reorderSuggestion.days} days) from ${reorderSuggestion.supplier} · last price ₦${formatNumber(reorderSuggestion.lastPrice)} per bag on ${reorderSuggestion.lastDate}. Saving the purchase adds the bags here automatically.`}
        </Alert>
      )}

      <Card>
        <CardHeader
          title={`${feed.name} ledger`}
          meta={<span className="type-body-sm text-fg-tertiary">Bags · closing = opening + received − used ± count adjustment</span>}
          action={{ label: 'Export', to: '#' }}
        />
        <Table columns={columns} rows={withBalances(feed.bags, [...sessionRows.reverse(), ...feed.ledger])} rowKey={(r) => r.date + r.source} />
        <LedgerNote>
          Opening, received and used are calculated. Only a physical count can adjust stock — and it always needs a reason (FR-INV-2).
        </LedgerNote>
      </Card>

      <Presence>{overlay === 'receive' && <ReceiveDeliveryDrawer onClose={() => setOverlay(null)} />}</Presence>
      <Presence>{overlay === 'reorder' && <AskReorderModal onClose={() => setOverlay(null)} />}</Presence>
    </>
  )
}

function FeedCard({ feed, selected, onSelect }: { feed: FeedType; selected: boolean; onSelect: () => void }) {
  const inUse = feed.daysOfCover !== null
  const low = inUse && feed.daysOfCover! <= LOW_COVER_DAYS
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-2 rounded-xl bg-surface px-5 py-4 text-left',
        selected ? 'border-[1.5px] border-line-brand' : 'border border-line hover:border-line-strong',
      )}
    >
      <span className="type-label-md text-fg-secondary">{feed.name}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="type-display-lg text-fg-primary">{feed.bags}</span>
        <span className="type-body-md text-fg-tertiary">bags</span>
      </span>
      <Badge dot tone={!inUse ? 'neutral' : low ? 'warning' : 'success'}>
        {inUse ? `${feed.daysOfCover} days of cover` : 'Not in use'}
      </Badge>
      <span className="type-body-sm text-fg-tertiary">
        {inUse ? `Reorder at ${feed.reorderAt} bags · ${feed.bagsPerDay} bags/day` : feed.note}
      </span>
    </button>
  )
}
