import { Presence } from '../../components/ui/Overlay'
import { useTrade } from '../../data/tradeContext'
import { PaymentModal } from '../payments/PaymentModal'
import { NewPurchaseDrawer } from './NewPurchaseDrawer'
import { PurchaseDrawer } from './PurchaseDrawer'

export type PurchaseOverlay = { kind: 'detail' | 'pay'; ref: string } | { kind: 'new' } | null

export function PurchaseOverlays({ overlay, setOverlay }: { overlay: PurchaseOverlay; setOverlay: (o: PurchaseOverlay) => void }) {
  const { purchases } = useTrade()
  const close = () => setOverlay(null)
  const p = overlay && overlay.kind !== 'new' ? purchases.find((x) => x.ref === overlay.ref) : undefined
  return (
    <Presence>
      {overlay?.kind === 'new' ? (
        <NewPurchaseDrawer onClose={close} />
      ) : p && overlay?.kind === 'detail' ? (
        <PurchaseDrawer purchase={p} onClose={close} onPay={() => setOverlay({ kind: 'pay', ref: p.ref })} />
      ) : p && overlay?.kind === 'pay' ? (
        <PaymentModal direction="out" partyId={p.supplierId} onClose={close} />
      ) : null}
    </Presence>
  )
}
