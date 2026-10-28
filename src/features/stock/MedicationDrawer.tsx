import { Button } from '../../components/ui/Button'
import { DetailSection, History } from '../../components/ui/Detail'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { medicationStatus, withdrawal, type Medication } from '../../data/inventory'
import { medMovements } from '../../data/reports'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

const supplierFor: Record<string, string> = { Vaccine: 'VetCare Pharma Ltd', Antibiotic: 'VetCare Pharma Ltd' }

/** One medication: stock, batch and every movement. */
export function MedicationDrawer({ medication: m, onClose }: { medication: Medication; onClose: () => void }) {
  const { stockOf, stockMoves } = useTrade()
  const stock = stockOf(m.name, m.stock)
  const moves = medMovements.filter((x) => x.medication === m.name)
  const lastUsed = moves.find((x) => x.kind === 'Used')
  const lastIn = moves.find((x) => x.kind === 'Received')
  const qty = (n: number) => `${formatNumber(n)} ${m.unit}`

  const events = [
    ...stockMoves.filter((x) => x.item === m.name).map((x) => ({ title: `${x.type === 'received' ? 'Delivered' : x.type === 'used' ? 'Used' : 'Adjusted'} ${qty(Math.abs(x.qty))}`, detail: x.source, time: 'Today' })),
    ...moves.map((x) => ({
      title: `${x.kind === 'Received' ? 'Delivered' : x.kind === 'Used' ? 'Used' : 'Written off'} ${formatNumber(Math.abs(x.qty))} ${x.unit}`,
      detail: [x.pen ? `Pen ${x.pen}` : x.batch, x.note, `by ${x.by}`].filter(Boolean).join(' · '),
      time: x.date,
    })),
  ]

  return (
    <Drawer
      open
      onClose={onClose}
      title={m.name}
      subtitle={`${m.category} · ${m.unit === 'g' ? 'packs by weight' : m.unit} · ${supplierFor[m.category] ?? 'VetCare Pharma Ltd'}`}
      footer={
        <Button size="lg" variant="primary" className="flex-1" onClick={onClose}>
          Done
        </Button>
      }
    >
      <DetailSection title="Stock">
        <KeyValueRow label="In store" strong>
          {qty(stock)}
        </KeyValueRow>
        <KeyValueRow label="Reorder at">{qty(m.reorderAt)}</KeyValueRow>
        <KeyValueRow label="Withdrawal">
          {m.withdrawalDays === null ? '—' : `${m.withdrawalDays} days${m.inUseBy ? ` · Pen ${m.inUseBy} until ${withdrawal.until}` : ''}`}
        </KeyValueRow>
        <KeyValueRow label="Last used">{lastUsed ? `${lastUsed.date} · ${lastUsed.pen ? `Pen ${lastUsed.pen}` : '—'}` : '—'}</KeyValueRow>
        <KeyValueRow label="Status" calculated>
          {medicationStatus({ ...m, stock }).label}
        </KeyValueRow>
      </DetailSection>
      <DetailSection title="Batches · first to expire is used first">
        <KeyValueRow label={m.batch}>
          {qty(stock)} · expires {m.expiry}
        </KeyValueRow>
        <KeyValueRow label="Last delivered" calculated>
          {lastIn ? `${lastIn.date} · ${qty(lastIn.qty)}` : '—'}
        </KeyValueRow>
      </DetailSection>
      <History events={events.length ? events : [{ title: 'No movements in the last 30 days', detail: 'Stock unchanged', time: '' }]} />
    </Drawer>
  )
}
