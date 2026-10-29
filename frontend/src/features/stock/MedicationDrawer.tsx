import { Button } from '../../components/ui/Button'
import { DetailSection, History } from '../../components/ui/Detail'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { Drawer } from '../../components/ui/Overlay'
import { explain } from '../../data/explain'
import { medicationStatus, type Medication } from '../../data/inventory'
import { dayMonth, todayISO, weekdayDayMonth, withdrawals } from '../../data/metrics'
import { useTrade } from '../../data/tradeContext'
import { formatNumber } from '../../lib/format'

const MOVED: Record<string, string> = { opening: 'Opening stock', received: 'Delivered', used: 'Used', adjusted: 'Adjusted' }

/** One medication: stock, batches and every movement. */
export function MedicationDrawer({ medication: m, onClose }: { medication: Medication; onClose: () => void }) {
  const { stockOf, history, catalog } = useTrade()
  const row = catalog.medications.find((x) => x.name === m.name)
  const stock = stockOf(m.name)
  const qty = (n: number) => `${formatNumber(n)} ${m.unit}`
  const batches = catalog.batches.filter((b) => b.medicationId === row?.id && b.onHand > 0)
  const opening = stock - batches.reduce((n, b) => n + b.onHand, 0)
  const moves = history.medMovements.filter((x) => x.medication_id === row?.id)
  const lastUsed = moves.find((x) => x.movement === 'used')
  const lastIn = moves.find((x) => x.movement === 'received')
  const inForce = withdrawals(history, catalog, todayISO()).filter((w) => w.medication === m.name)
  const lastBuy = history.purchases.filter((p) => p.medication_id === row?.id).sort((a, b) => b.purchased_on.localeCompare(a.purchased_on))[0]
  const supplier = lastBuy ? catalog.suppliers.find((s) => s.id === lastBuy.supplier_id)?.name : undefined
  const batchNo = new Map(catalog.batches.map((b) => [b.purchaseId, b.batchNo]))

  const events = moves.slice(0, 30).map((x) => {
    const q = Number(x.quantity)
    return {
      title: `${MOVED[x.movement] ?? x.movement} ${qty(Math.abs(q))}`,
      detail: [x.pen_id ? `Pen ${x.pen_id}` : null, x.purchase_id ? `Batch ${batchNo.get(x.purchase_id) ?? '—'}` : null].filter(Boolean).join(' · ') || '—',
      time: dayMonth(x.moved_on),
    }
  })

  return (
    <Drawer
      open
      onClose={onClose}
      title={m.name}
      subtitle={[m.category, m.unit, supplier ? `last bought from ${supplier}` : null].filter(Boolean).join(' · ')}
      footer={
        <Button size="lg" variant="primary" className="flex-1" onClick={onClose}>
          Done
        </Button>
      }
    >
      <DetailSection title="Stock">
        <KeyValueRow label="In store" strong calculated={explain.medicationOnHand()}>
          {qty(stock)}
        </KeyValueRow>
        <KeyValueRow label="Reorder at">{qty(m.reorderAt)}</KeyValueRow>
        <KeyValueRow label="Withdrawal" calculated={explain.withdrawal()}>
          {m.withdrawalDays === null ? '—' : `${m.withdrawalDays} days${inForce.length ? ` · ${inForce.map((w) => `Pen ${w.penId} until ${weekdayDayMonth(w.clearFrom)}`).join(', ')}` : ''}`}
        </KeyValueRow>
        <KeyValueRow label="Last used">{lastUsed ? `${dayMonth(lastUsed.moved_on)} · ${lastUsed.pen_id ? `Pen ${lastUsed.pen_id}` : '—'}` : '—'}</KeyValueRow>
        <KeyValueRow label="Status" calculated={explain.medicationStatus()}>
          {medicationStatus({ ...m, stock, inUseBy: inForce[0]?.penId }).label}
        </KeyValueRow>
      </DetailSection>
      <DetailSection title="Batches · first to expire is used first">
        {batches.map((b) => (
          <KeyValueRow key={b.purchaseId} label={b.batchNo ?? 'No batch number'}>
            {qty(b.onHand)}
            {b.expiry ? ` · expires ${b.expiry.slice(8, 10)}/${b.expiry.slice(5, 7)}/${b.expiry.slice(0, 4)}` : ''}
          </KeyValueRow>
        ))}
        {opening > 0 && (
          <KeyValueRow label="Opening stock" calculated={`${explain.openingMedication()} Shown as stock in store − what is left in the batches.`}>
            {qty(opening)} · no batch recorded
          </KeyValueRow>
        )}
        <KeyValueRow label="Last delivered" calculated="The latest delivery received for this medication, from the stock records.">
          {lastIn ? `${dayMonth(lastIn.moved_on)} · ${qty(Number(lastIn.quantity))}` : '—'}
        </KeyValueRow>
      </DetailSection>
      <History events={events.length ? events : [{ title: 'No movements recorded yet', detail: 'Stock unchanged', time: '' }]} />
    </Drawer>
  )
}
