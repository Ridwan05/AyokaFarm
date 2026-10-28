// Mock purchases matching P-D10 / P-D30 and the purchase overlays.

export type PurchaseKind = 'Feed' | 'Birds' | 'Medication'

export type PurchaseEvent = { title: string; detail: string; time: string }

export type Purchase = {
  ref: string
  /** ISO date */
  date: string
  supplierId: string
  kind: PurchaseKind
  item: string
  qty: number
  /** e.g. "bags", "birds", "× 100 g" */
  unit: string
  /** Price per unit as written on the invoice, e.g. "a bag". */
  per: string
  price: number
  /** Paid at the time of purchase. Later payments are ledger entries (payments.ts). */
  paidAtPurchase: number
  recordedBy: string
  received?: string
  history: PurchaseEvent[]
}

export const totalOf = (p: Purchase) => p.qty * p.price

const paidInFull = (by: string, time: string, amount: number): PurchaseEvent => ({ title: `Paid ₦${amount.toLocaleString('en-NG')}`, detail: `By ${by} · transfer`, time })

export const initialPurchases: Purchase[] = [
  {
    ref: 'PF-0418', date: '2026-10-06', supplierId: 'greenfield', kind: 'Feed', item: 'Layer mash', qty: 100, unit: 'bags', per: 'a bag', price: 18500, paidAtPurchase: 0, recordedBy: 'Adeola', received: '06/10 · by Bayo',
    history: [{ title: 'Received 100 bags', detail: 'By Bayo · stock 65 → 165', time: '06/10' }],
  },
  { ref: 'PM-0112', date: '2026-10-02', supplierId: 'vetcare', kind: 'Medication', item: 'Amoxicillin 20%', qty: 10, unit: '× 100 g', per: 'a 100 g pack', price: 8500, paidAtPurchase: 0, recordedBy: 'Adeola', received: '02/10 · by Bayo', history: [{ title: 'Received 10 packs', detail: 'By Bayo · batch AX-2209', time: '02/10' }] },
  { ref: 'PF-0412', date: '2026-10-01', supplierId: 'greenfield', kind: 'Feed', item: 'Broiler starter', qty: 60, unit: 'bags', per: 'a bag', price: 19500, paidAtPurchase: 1170000, recordedBy: 'Adeola', received: '01/10 · by Bayo', history: [paidInFull('Adeola', '01/10', 1170000)] },
  { ref: 'PF-0409', date: '2026-09-29', supplierId: 'sunshine', kind: 'Feed', item: 'Broiler finisher', qty: 80, unit: 'bags', per: 'a bag', price: 19000, paidAtPurchase: 1540000, recordedBy: 'Adeola', received: '29/09 · by Bayo', history: [{ title: 'Paid ₦1,540,000', detail: 'By Adeola · ₦20,000 over — held as credit', time: '29/09' }] },
  { ref: 'PB-0031', date: '2026-09-18', supplierId: 'oyo', kind: 'Birds', item: 'Day-old broilers', qty: 1300, unit: 'birds', per: 'a bird', price: 850, paidAtPurchase: 0, recordedBy: 'Adeola', received: '18/09 · Pen 6', history: [{ title: 'Received 1,300 birds', detail: 'By Bayo · placed in Pen 6', time: '18/09' }] },
  { ref: 'PM-0108', date: '2026-09-15', supplierId: 'vetcare', kind: 'Medication', item: 'Gumboro vaccine', qty: 4, unit: 'vials', per: 'a vial', price: 7000, paidAtPurchase: 28000, recordedBy: 'Adeola', history: [paidInFull('Adeola', '15/09', 28000)] },
  { ref: 'PF-0401', date: '2026-09-12', supplierId: 'greenfield', kind: 'Feed', item: 'Layer mash', qty: 120, unit: 'bags', per: 'a bag', price: 18000, paidAtPurchase: 2160000, recordedBy: 'Adeola', history: [paidInFull('Adeola', '12/09', 2160000)] },
  { ref: 'PF-0398', date: '2026-09-08', supplierId: 'sunshine', kind: 'Feed', item: 'Broiler finisher', qty: 60, unit: 'bags', per: 'a bag', price: 19000, paidAtPurchase: 1140000, recordedBy: 'Adeola', history: [paidInFull('Adeola', '08/09', 1140000)] },
  { ref: 'PM-0103', date: '2026-09-05', supplierId: 'vetcare', kind: 'Medication', item: 'Amprolium 20%', qty: 4, unit: '× 250 g', per: 'a 250 g pack', price: 9000, paidAtPurchase: 36000, recordedBy: 'Adeola', history: [paidInFull('Adeola', '05/09', 36000)] },
  { ref: 'PB-0030', date: '2026-09-03', supplierId: 'oyo', kind: 'Birds', item: 'Day-old broilers', qty: 2000, unit: 'birds', per: 'a bird', price: 850, paidAtPurchase: 1700000, recordedBy: 'Adeola', history: [paidInFull('Adeola', '03/09', 1700000)] },
  { ref: 'PF-0393', date: '2026-08-29', supplierId: 'greenfield', kind: 'Feed', item: 'Layer mash', qty: 110, unit: 'bags', per: 'a bag', price: 18000, paidAtPurchase: 1980000, recordedBy: 'Adeola', history: [paidInFull('Adeola', '29/08', 1980000)] },
  { ref: 'PF-0386', date: '2026-08-22', supplierId: 'greenfield', kind: 'Feed', item: 'Broiler starter', qty: 80, unit: 'bags', per: 'a bag', price: 19000, paidAtPurchase: 1520000, recordedBy: 'Adeola', history: [paidInFull('Adeola', '22/08', 1520000)] },
  { ref: 'PM-0099', date: '2026-08-18', supplierId: 'vetcare', kind: 'Medication', item: 'Vitalyte (Vitamin C)', qty: 2, unit: 'kg', per: 'a kg', price: 12000, paidAtPurchase: 24000, recordedBy: 'Adeola', history: [paidInFull('Adeola', '18/08', 24000)] },
]

export const refPrefix: Record<PurchaseKind, string> = { Feed: 'PF', Birds: 'PB', Medication: 'PM' }
