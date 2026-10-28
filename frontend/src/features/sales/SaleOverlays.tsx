import { Presence } from '../../components/ui/Overlay'
import type { Sale } from '../../data/sales'
import { useTrade } from '../../data/tradeContext'
import { RecordPaymentModal } from './RecordPaymentModal'
import { RecordSaleDrawer } from './RecordSaleDrawer'
import { SaleDrawer } from './SaleDrawer'

export type SaleOverlay = { kind: 'detail' | 'payment'; receipt: string } | { kind: 'record' } | null

/** Renders whichever sale overlay is open. Looks the sale up so it reflects live changes. */
export function SaleOverlays({ overlay, setOverlay }: { overlay: SaleOverlay; setOverlay: (o: SaleOverlay) => void }) {
  const { sales } = useTrade()
  const close = () => setOverlay(null)
  const pay = (s: Sale) => setOverlay({ kind: 'payment', receipt: s.receipt })
  const sale = overlay && overlay.kind !== 'record' ? sales.find((s) => s.receipt === overlay.receipt) : undefined
  return (
    <Presence>
      {overlay?.kind === 'record' ? (
        <RecordSaleDrawer onClose={close} />
      ) : sale && overlay?.kind === 'detail' ? (
        <SaleDrawer sale={sale} onClose={close} onRecordPayment={pay} />
      ) : sale && overlay?.kind === 'payment' ? (
        <RecordPaymentModal sale={sale} onClose={close} />
      ) : null}
    </Presence>
  )
}
