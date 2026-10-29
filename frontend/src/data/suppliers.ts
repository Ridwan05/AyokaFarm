// Mock suppliers matching P-D16 · Suppliers. What we owe is calculated from purchases (ledger.ts).

export type Supplier = {
  id: string
  name: string
  short: string
  initials: string
  kind: 'Feed' | 'Medication' | 'Birds' | 'Equipment'
  supplies: string
  since: string
  phone: string
  /** Pay within this many days of delivery. */
  termsDays: number
  lastPurchase: string
  lastPayment: string
  /** What we owed them at go-live. */
  opening?: number
  openingSource?: string
  openingChecked?: boolean
}

export const suppliers: Supplier[] = [
  { id: 'greenfield', since: 'Aug 2026', phone: '0809 ••• 3360', termsDays: 7, name: 'Greenfield Feeds', short: 'Greenfield', initials: 'GF', kind: 'Feed', supplies: 'Layer mash, broiler starter', lastPurchase: '06/10', lastPayment: '07/10' },
  { id: 'vetcare', since: 'Jul 2026', phone: '0803 ••• 1182', termsDays: 14, name: 'VetCare Pharma Ltd', short: 'VetCare', initials: 'VP', kind: 'Medication', supplies: 'Antibiotics, vaccines', lastPurchase: '02/10', lastPayment: '15/09' },
  { id: 'oyo', since: 'Jul 2026', phone: '0705 ••• 9021', termsDays: 14, name: 'Oyo Hatcheries', short: 'Oyo Hatcheries', initials: 'OH', kind: 'Birds', supplies: 'Day-old chicks', lastPurchase: '18/09', lastPayment: '30/09' },
  { id: 'sunshine', since: 'Sep 2026', phone: '0816 ••• 4470', termsDays: 7, name: 'Sunshine Feed Mills', short: 'Sunshine', initials: 'SF', kind: 'Feed', supplies: 'Broiler finisher', lastPurchase: '29/09', lastPayment: '29/09' },
  { id: 'ibadan-crates', since: 'Jul 2026', phone: '0802 ••• 5513', termsDays: 0, name: 'Ibadan Crates & Cages', short: 'Ibadan Crates', initials: 'IC', kind: 'Equipment', supplies: 'Egg crates, cages', lastPurchase: '07/10', lastPayment: '07/10' },
  { id: 'agro-farm', since: 'Jul 2026', phone: '0813 ••• 0094', termsDays: 0, name: 'Agro Farm Supplies', short: 'Agro Farm', initials: 'AF', kind: 'Equipment', supplies: 'Drinkers, feeders', lastPurchase: '14/08', lastPayment: '14/08' },
]
