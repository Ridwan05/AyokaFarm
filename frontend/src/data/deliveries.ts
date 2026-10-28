// Mock deliveries for the Store Keeper (ST-D52). Orders are purchases placed but not yet received.

export type StockKind = 'feed' | 'medication'

export type Order = {
  ref: string
  supplierId: string
  kind: StockKind
  item: string
  qty: number
  /** Unit as written on the order, e.g. "bags", "× 250 g" */
  unit: string
  /** Stock units each ordered unit adds (e.g. 250 g per pack). */
  perUnit: number
  stockUnit: string
  ordered: string
  orderedBy: string
}

export type Delivery = Omit<Order, 'orderedBy'> & { received: string; by: string; sentBack: number; note: string }

export const initialOrders: Order[] = [
  { ref: 'PF-0419', supplierId: 'greenfield', kind: 'feed', item: 'Layer mash', qty: 100, unit: 'bags', perUnit: 1, stockUnit: 'bags', ordered: '09/10', orderedBy: 'Adeola' },
  { ref: 'PM-0113', supplierId: 'vetcare', kind: 'medication', item: 'Amprolium 20%', qty: 4, unit: '× 250 g', perUnit: 250, stockUnit: 'g', ordered: '07/10', orderedBy: 'Adeola' },
]

export const initialDeliveries: Delivery[] = [
  { ref: 'PF-0418', supplierId: 'greenfield', kind: 'feed', item: 'Layer mash', qty: 100, unit: 'bags', perUnit: 1, stockUnit: 'bags', ordered: '06/10', received: '06/10 11:20', by: 'Bayo', sentBack: 0, note: 'GF-DN-5488' },
  { ref: 'PM-0112', supplierId: 'vetcare', kind: 'medication', item: 'Amoxicillin 20%', qty: 10, unit: '× 100 g', perUnit: 100, stockUnit: 'g', ordered: '02/10', received: '02/10 15:05', by: 'Bayo', sentBack: 0, note: 'VC-2209' },
  { ref: 'PF-0412', supplierId: 'greenfield', kind: 'feed', item: 'Broiler starter', qty: 60, unit: 'bags', perUnit: 1, stockUnit: 'bags', ordered: '01/10', received: '01/10 10:40', by: 'Bayo', sentBack: 0, note: 'GF-DN-5431' },
  { ref: 'PF-0409', supplierId: 'sunshine', kind: 'feed', item: 'Broiler finisher', qty: 80, unit: 'bags', perUnit: 1, stockUnit: 'bags', ordered: '29/09', received: '29/09 12:15', by: 'Bayo', sentBack: 0, note: 'SF-1120' },
]

/** A change to stock made in this session (delivery received or count adjustment). */
export type StockMove = { item: string; qty: number; type: 'received' | 'adjust' | 'used'; source: string }
