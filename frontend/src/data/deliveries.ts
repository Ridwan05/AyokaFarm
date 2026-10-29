// Deliveries for the Store Keeper (ST-D52), loaded in remote.ts. Orders are purchases placed but not yet received.

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

/** A change to stock made in this session (delivery received or count adjustment). */
export type StockMove = { item: string; qty: number; type: 'received' | 'adjust' | 'used'; source: string }
