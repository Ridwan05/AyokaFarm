import type { PaymentMethod } from './sales'

// Mock payments matching P-D13 · Payments: money received or paid outside a sale or purchase.

export type Payment = {
  ref: string
  /** ISO date */
  date: string
  direction: 'in' | 'out'
  /** Customer id (in) or supplier id (out). Refs: P- for money in, PP- for money out. */
  partyId: string
  method: PaymentMethod
  reference: string | null
  amount: number
  cleared: string
  by: string
}

export const initialPayments: Payment[] = [
  { ref: 'P-0241', date: '2026-10-08', direction: 'in', partyId: 'unity-hotels', method: 'transfer', reference: 'TRF-88231', amount: 150000, cleared: 'S-0998 in full · S-1010 part', by: 'Funmi' },
  { ref: 'P-0240', date: '2026-10-07', direction: 'in', partyId: 'st-marys', method: 'transfer', reference: 'TRF-87102', amount: 80000, cleared: 'S-1001 in full', by: 'Funmi' },
  { ref: 'P-0239', date: '2026-10-06', direction: 'in', partyId: 'chief-bello', method: 'cash', reference: null, amount: 60000, cleared: 'S-0951 part', by: 'Funmi' },
  { ref: 'P-0238', date: '2026-10-05', direction: 'in', partyId: 'kola', method: 'transfer', reference: 'TRF-86554', amount: 50000, cleared: 'S-0992 in full', by: 'Funmi' },
  { ref: 'P-0237', date: '2026-10-04', direction: 'in', partyId: 'mrs-okafor', method: 'POS', reference: 'POS-4471', amount: 50000, cleared: 'S-1005 part', by: 'Funmi' },
  { ref: 'PP-0089', date: '2026-10-07', direction: 'out', partyId: 'greenfield', method: 'transfer', reference: 'TRF-87950', amount: 300000, cleared: 'PF-0418 part', by: 'Funmi' },
  { ref: 'PP-0087', date: '2026-10-06', direction: 'out', partyId: 'greenfield', method: 'transfer', reference: 'TRF-87610', amount: 1250000, cleared: 'PF-0418 part', by: 'Adeola' },
  { ref: 'PP-0086', date: '2026-09-30', direction: 'out', partyId: 'oyo', method: 'transfer', reference: 'TRF-85120', amount: 1035000, cleared: 'PB-0031 part', by: 'Adeola' },
  // Older payments that cleared the go-live opening balances.
  { ref: 'P-0221', date: '2026-07-15', direction: 'in', partyId: 'unity-hotels', method: 'transfer', reference: 'TRF-60114', amount: 180000, cleared: 'Opening balance in full', by: 'Funmi' },
  { ref: 'P-0224', date: '2026-07-22', direction: 'in', partyId: 'chief-bello', method: 'cash', reference: null, amount: 96000, cleared: 'Opening balance in full', by: 'Funmi' },
  { ref: 'P-0226', date: '2026-07-29', direction: 'in', partyId: 'st-marys', method: 'transfer', reference: 'TRF-62290', amount: 64000, cleared: 'Opening balance in full', by: 'Funmi' },
  { ref: 'P-0228', date: '2026-08-05', direction: 'in', partyId: 'kola', method: 'transfer', reference: 'TRF-63005', amount: 52500, cleared: 'Opening balance in full', by: 'Funmi' },
  { ref: 'P-0230', date: '2026-08-12', direction: 'in', partyId: 'grace', method: 'POS', reference: 'POS-3910', amount: 38000, cleared: 'Opening balance in full', by: 'Funmi' },
  { ref: 'P-0233', date: '2026-07-19', direction: 'in', partyId: 'mama-titi', method: 'transfer', reference: 'TRF-61207', amount: 77500, cleared: 'Opening balance part', by: 'Funmi' },
]
