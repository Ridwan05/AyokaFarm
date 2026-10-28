// Mock customers matching P-D15 · Customers and the P-D3 statements.
// Balances are never stored: they're calculated from each customer's ledger (see ledger.ts).

/** A sale from before the sales in `sales.ts`. */
export type OlderSale = {
  ref: string
  /** ISO date */
  date: string
  label: string
  amount: number
  /** Paid at the time of sale */
  paid: number
}

export type Customer = {
  id: string
  name: string
  short: string
  initials: string
  buys: string
  since: string
  area: string
  lastSale: string
  whatsapp: boolean
  /** Balance carried in when the farm went live (01 Jul 2026). */
  opening: number
  /** Where the opening balance came from, and whether someone checked it (go-live step 4). */
  openingSource?: string
  openingChecked?: boolean
  olderSales: OlderSale[]
}

export const GO_LIVE = '2026-07-01'

const eggs = (crates: number, price: number) => `Sale · Eggs ${crates} cr × ₦${price.toLocaleString('en-NG')}`
const birds = (n: number, price: number) => `Sale · Broilers ${n} × ₦${price.toLocaleString('en-NG')}`

export const customers: Customer[] = [
  {
    id: 'mama-titi', name: 'Mama Titi Stores', short: 'Mama Titi', initials: 'MT', buys: 'Eggs', since: 'Jan 2025', area: 'Bodija market', lastSale: '09/10', whatsapp: true, opening: 245000, openingSource: 'Sales book p. 31', openingChecked: true,
    olderSales: [
      { ref: 'S-0871', date: '2026-07-05', label: eggs(50, 3900), amount: 195000, paid: 150000 },
      { ref: 'S-0912', date: '2026-08-02', label: eggs(40, 4000), amount: 160000, paid: 160000 },
      { ref: 'S-0968', date: '2026-08-30', label: eggs(45, 4100), amount: 184500, paid: 184500 },
      { ref: 'S-1003', date: '2026-09-18', label: eggs(40, 4200), amount: 168000, paid: 68000 },
    ],
  },
  {
    id: 'unity-hotels', name: 'Unity Hotels', short: 'Unity Hotels', initials: 'UH', buys: 'Broilers', since: 'Mar 2025', area: 'Ring Road', lastSale: '21/09', whatsapp: true, opening: 180000, openingSource: 'Sales book p. 33', openingChecked: true,
    olderSales: [
      { ref: 'S-0998', date: '2026-08-20', label: birds(30, 3000), amount: 90000, paid: 0 },
      { ref: 'S-1010', date: '2026-08-29', label: birds(100, 2750), amount: 275000, paid: 0 },
    ],
  },
  {
    id: 'chief-bello', name: 'Chief Bello Caterers', short: 'Chief Bello', initials: 'CB', buys: 'Broilers', since: 'Aug 2024', area: 'Agodi', lastSale: '21/09', whatsapp: false, opening: 96000, openingSource: 'WhatsApp, 28 Jun', openingChecked: true,
    olderSales: [
      { ref: 'S-0951', date: '2026-08-12', label: birds(48, 3000), amount: 144000, paid: 0 },
      { ref: 'S-0987', date: '2026-09-03', label: birds(40, 2500), amount: 100000, paid: 0 },
    ],
  },
  {
    id: 'mrs-okafor', name: 'Mrs Okafor Bakery', short: 'Mrs Okafor', initials: 'MO', buys: 'Eggs', since: 'Jun 2025', area: 'Mokola', lastSale: '07/10', whatsapp: true, opening: 0,
    olderSales: [{ ref: 'S-1005', date: '2026-09-20', label: eggs(35, 4143), amount: 145000, paid: 0 }],
  },
  {
    id: 'st-marys', name: 'St. Mary’s School', short: 'St. Mary’s', initials: 'SM', buys: 'Eggs', since: 'Jan 2026', area: 'Oke-Ado', lastSale: '07/10', whatsapp: false, opening: 64000, openingSource: 'Sales book p. 30', openingChecked: true,
    olderSales: [
      { ref: 'S-1001', date: '2026-09-15', label: eggs(20, 4000), amount: 80000, paid: 0 },
      { ref: 'S-1009', date: '2026-09-27', label: eggs(4, 4000), amount: 16000, paid: 0 },
    ],
  },
  { id: 'grace', name: 'Grace Supermart', short: 'Grace Supermart', initials: 'GS', buys: 'Eggs', since: 'Feb 2025', area: 'Challenge', lastSale: '08/10', whatsapp: true, opening: 38000, openingSource: 'Invoice 0611', openingChecked: true, olderSales: [] },
  {
    id: 'kola', name: 'Kola Eateries', short: 'Kola Eateries', initials: 'KE', buys: 'Eggs', since: 'May 2025', area: 'Dugbe', lastSale: '08/10', whatsapp: true, opening: 52500, openingSource: 'Sales book p. 32', openingChecked: false,
    olderSales: [
      { ref: 'S-0992', date: '2026-09-01', label: eggs(12, 4167), amount: 50000, paid: 0 },
      { ref: 'S-0996', date: '2026-09-05', label: eggs(21, 4214), amount: 88500, paid: 0 },
    ],
  },
  {
    id: 'alhaji-sani', name: 'Alhaji Sani', short: 'Alhaji Sani', initials: 'AS', buys: 'Spent layers', since: 'Nov 2025', area: 'Sabo', lastSale: '17/09', whatsapp: false, opening: 0,
    olderSales: [{ ref: 'S-0981', date: '2026-09-17', label: 'Sale · Spent layers 9 × ₦5,000', amount: 45000, paid: 0 }],
  },
  {
    id: 'bodija', name: 'Bodija Egg Sellers', short: 'Bodija', initials: 'BE', buys: 'Eggs', since: 'Apr 2025', area: 'Bodija market', lastSale: '09/10', whatsapp: true, opening: 0,
    olderSales: [{ ref: 'S-1020', date: '2026-09-30', label: eggs(9, 4000), amount: 36000, paid: 0 }],
  },
  { id: 'green-acres', name: 'Green Acres Farm', short: 'Green Acres', initials: 'GA', buys: 'Droppings', since: 'Jul 2025', area: 'Moniya', lastSale: '09/10', whatsapp: true, opening: 0, olderSales: [] },
]

/** Walk-in buyers who pay in full. */
export const ONE_OFF = { id: 'one-off', name: 'One-off buyer', initials: 'OB' }
