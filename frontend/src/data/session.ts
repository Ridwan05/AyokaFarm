export type Role = 'owner' | 'farm-manager' | 'sales-accounts' | 'store-keeper' | 'pen-attendant' | 'pen-attendant-all'

export type User = {
  name: string
  initials: string
  role: Role
  roleLabel: string
  /** Pens this person works in. Pen attendants only see these. */
  pens: number[] | 'all'
}

/** Everyone signs in to the same web app — on a PC in the office or a phone in the pen. */
export const users: User[] = [
  { name: 'Adeola Ogunleye', initials: 'AO', role: 'owner', roleLabel: 'Owner · Admin', pens: 'all' },
  { name: 'Emeka Nwosu', initials: 'EN', role: 'farm-manager', roleLabel: 'Farm Manager', pens: 'all' },
  { name: 'Funmi Adebayo', initials: 'FA', role: 'sales-accounts', roleLabel: 'Sales & Accounts', pens: [] },
  { name: 'Bayo Lawal', initials: 'BL', role: 'store-keeper', roleLabel: 'Store Keeper', pens: [] },
  { name: 'Musa Ibrahim', initials: 'MI', role: 'pen-attendant', roleLabel: 'Pen Attendant · Pens 3, 4, 5', pens: [3, 4, 5] },
  { name: 'Kemi Adewale', initials: 'KA', role: 'pen-attendant', roleLabel: 'Pen Attendant · Pen 2', pens: [2] },
  { name: 'Yemi Okafor', initials: 'YO', role: 'pen-attendant-all', roleLabel: 'Pen Attendant · all pens', pens: 'all' },
]

export const farm = {
  name: 'AyokaFarm',
  today: new Date(2026, 9, 9),
}
