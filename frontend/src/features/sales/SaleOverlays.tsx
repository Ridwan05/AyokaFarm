import { Presence } from '../../components/ui/Overlay'
import { amountOf, type Sale } from '../../data/sales'
import { useTrade } from '../../data/tradeContext'
import { VoidModal } from '../records/VoidModal'
import { EditSaleModal } from './EditSaleModal'
import { RecordPaymentModal } from './RecordPaymentModal'
import { RecordSaleDrawer } from './RecordSaleDrawer'
import { SaleDrawer } from './SaleDrawer'

export type SaleOverlay = { kind: 'detail' | 'payment' | 'edit' | 'void'; receipt: string } | { kind: 'record' } | null

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
        <SaleDrawer
          sale={sale}
          onClose={close}
          onRecordPayment={pay}
          onEdit={(s) => setOverlay({ kind: 'edit', receipt: s.receipt })}
          onVoid={(s) => setOverlay({ kind: 'void', receipt: s.receipt })}
        />
      ) : sale && overlay?.kind === 'payment' ? (
        <RecordPaymentModal sale={sale} onClose={close} />
      ) : sale && overlay?.kind === 'edit' ? (
        <EditSaleModal sale={sale} onClose={close} />
      ) : sale && overlay?.kind === 'void' ? (
        <VoidModal kind="sales" refId={sale.receipt} label={`₦${amountOf(sale).toLocaleString('en-NG')} · ${sale.date}`} onClose={close} />
      ) : null}
    </Presence>
  )
}
