import type { Tone } from '../components/ui/Badge'
import type { Role } from './session'

// Mock settings matching P-D18–21, P-D39 and P-D40.

export type StaffMember = {
  id: string
  name: string
  initials: string
  phone: string
  role: Role
  pens: string
  lastActive: string
  whatsapp: boolean
  active: boolean
}

export const roleLabels: Record<StaffMember['role'], string> = {
  owner: 'Owner · Admin',
  'farm-manager': 'Farm Manager',
  'sales-accounts': 'Sales & Accounts',
  'store-keeper': 'Store Keeper',
  'pen-attendant': 'Pen Attendant',
  'pen-attendant-all': 'Pen Attendant · all pens',
}

export const staff: StaffMember[] = [
  { id: 'adeola', name: 'Adeola Ogunleye', initials: 'AO', phone: '0803 ••• 1182', role: 'owner', pens: 'All pens', lastActive: 'Today 16:40', whatsapp: true, active: true },
  { id: 'emeka', name: 'Emeka Nwosu', initials: 'EN', phone: '0806 ••• 4410', role: 'farm-manager', pens: 'All pens', lastActive: 'Today 15:55', whatsapp: true, active: true },
  { id: 'funmi', name: 'Funmi Adebayo', initials: 'FA', phone: '0812 ••• 0937', role: 'sales-accounts', pens: '—', lastActive: 'Today 15:10', whatsapp: true, active: true },
  { id: 'bayo', name: 'Bayo Lawal', initials: 'BL', phone: '0701 ••• 5524', role: 'store-keeper', pens: '—', lastActive: 'Today 14:02', whatsapp: true, active: true },
  { id: 'musa', name: 'Musa Ibrahim', initials: 'MI', phone: '0810 ••• 7731', role: 'pen-attendant', pens: 'Pens 3, 4, 5', lastActive: 'Today 08:02', whatsapp: true, active: true },
  { id: 'kemi', name: 'Kemi Adewale', initials: 'KA', phone: '0905 ••• 3318', role: 'pen-attendant', pens: 'Pen 2', lastActive: 'Today 07:12', whatsapp: true, active: true },
  { id: 'tunde', name: 'Tunde Bakare', initials: 'TB', phone: '0814 ••• 6620', role: 'pen-attendant', pens: 'Pen 6', lastActive: 'Today 06:51', whatsapp: true, active: true },
  { id: 'chidi', name: 'Chidi Okeke', initials: 'CO', phone: '0703 ••• 2290', role: 'pen-attendant', pens: 'Pen 1', lastActive: 'Today 06:40', whatsapp: false, active: true },
  { id: 'yemi', name: 'Yemi Okafor', initials: 'YO', phone: '0816 ••• 2045', role: 'pen-attendant-all', pens: 'All pens', lastActive: 'Today 07:30', whatsapp: true, active: true },
  { id: 'segun', name: 'Segun Alabi', initials: 'SA', phone: '0802 ••• 4417', role: 'pen-attendant', pens: '—', lastActive: '14/09', whatsapp: false, active: false },
]

// ── Roles & permissions ─────────────────────────────────────────────

export const modules = [
  'Production',
  'Inventory — feed & eggs',
  'Medication stock',
  'Expenses',
  'Dashboard',
  'Sales',
  'Purchases',
  'Payments',
  'Customers & suppliers',
  'Admin & settings',
] as const
export type Module = (typeof modules)[number]

/** true = allowed, 'partial' = allowed with a narrower scope, false = not allowed. */
export type Tick = boolean | 'partial'
export type Permission = { view: Tick; add: Tick; edit: Tick; delete: Tick; scope: string }

const all = (scope = 'All records'): Permission => ({ view: true, add: true, edit: true, delete: true, scope })
const none: Permission = { view: false, add: false, edit: false, delete: false, scope: 'Hidden' }
const readOnly = (scope = 'Read only'): Permission => ({ view: true, add: false, edit: false, delete: false, scope })
const work = (scope: string): Permission => ({ view: true, add: true, edit: true, delete: false, scope })

export type RoleDef = { id: StaffMember['role']; name: string; description: string; permissions: Record<Module, Permission> }

const byModule = (f: (m: Module) => Permission) => Object.fromEntries(modules.map((m) => [m, f(m)])) as Record<Module, Permission>

export const roles: RoleDef[] = [
  { id: 'owner', name: 'Admin', description: 'Everything, including staff, roles and settings. Can restore deleted records.', permissions: byModule(() => all()) },
  {
    id: 'farm-manager',
    name: 'Farm Manager',
    description: 'Runs the farm day to day. Approves below-minimum sales and late entries.',
    permissions: byModule((m) => (m === 'Admin & settings' ? { view: 'partial', add: false, edit: false, delete: false, scope: 'Staff list · assigns pens' } : work(m === 'Production' ? 'All pens · corrections with a reason' : 'All records'))),
  },
  {
    id: 'pen-attendant',
    name: 'Pen Attendant',
    description: 'Records daily production for assigned pens. Sees only those pens.',
    permissions: byModule((m) =>
      m === 'Production' ? { view: true, add: true, edit: true, delete: false, scope: 'Own pens · edit until 23:59' }
      : m === 'Inventory — feed & eggs' || m === 'Medication stock' ? readOnly()
      : m === 'Expenses' ? { view: false, add: true, edit: false, delete: false, scope: 'Own pens · add only' }
      : m === 'Dashboard' ? { view: 'partial', add: false, edit: false, delete: false, scope: 'Production tiles only' }
      : none,
    ),
  },
  {
    id: 'pen-attendant-all',
    name: 'Pen Attendant · all pens',
    description: 'Records daily production and pen expenses for every pen — relief cover.',
    permissions: byModule((m) =>
      m === 'Production' ? { view: true, add: true, edit: true, delete: false, scope: 'All pens · edit until 23:59' }
      : m === 'Inventory — feed & eggs' || m === 'Medication stock' ? readOnly()
      : m === 'Expenses' ? { view: false, add: true, edit: false, delete: false, scope: 'Any pen · add only' }
      : m === 'Dashboard' ? { view: 'partial', add: false, edit: false, delete: false, scope: 'Production tiles only' }
      : none,
    ),
  },
  {
    id: 'store-keeper',
    name: 'Store Keeper',
    description: 'Receives deliveries and counts feed, eggs and medication.',
    permissions: byModule((m) =>
      m === 'Inventory — feed & eggs' || m === 'Medication stock' ? work('Deliveries and counts')
      : m === 'Purchases' ? { view: false, add: true, edit: false, delete: false, scope: 'Receives deliveries only' }
      : none,
    ),
  },
  {
    id: 'sales-accounts',
    name: 'Sales & Accounts',
    description: 'Records sales, purchases, expenses and payments; sends statements.',
    permissions: byModule((m) =>
      ['Sales', 'Purchases', 'Expenses', 'Payments', 'Customers & suppliers'].includes(m) ? work('All records · deletes need a reason')
      : m === 'Dashboard' ? { view: 'partial', add: false, edit: false, delete: false, scope: 'Money tiles only' }
      : none,
    ),
  },
]

export const EDIT_WINDOWS = ['Until 23:59 the same day', 'Within 1 hour', 'Never — corrections only'] as const
export const LATE_ENTRIES = ['Up to 2 days back, flagged', 'Up to 1 day back, flagged', 'Not allowed'] as const

// ── Feed & targets ─────────────────────────────────────────────────

export type FeedBand = { from: number; to: number | null; grams: number; feed: string }

export const feedBands: Record<'Layers · Isa Brown' | 'Broilers · Ross 308', FeedBand[]> = {
  'Layers · Isa Brown': [
    { from: 1, to: 2, grams: 15, feed: 'Chick mash' },
    { from: 3, to: 6, grams: 32, feed: 'Chick mash' },
    { from: 7, to: 10, grams: 50, feed: 'Grower mash' },
    { from: 11, to: 16, grams: 68, feed: 'Grower mash' },
    { from: 17, to: 18, grams: 95, feed: 'Layer mash' },
    { from: 19, to: null, grams: 115, feed: 'Layer mash' },
  ],
  'Broilers · Ross 308': [
    { from: 1, to: 1, grams: 20, feed: 'Broiler starter' },
    { from: 2, to: 2, grams: 45, feed: 'Broiler starter' },
    { from: 3, to: 3, grams: 75, feed: 'Broiler starter' },
    { from: 4, to: 4, grams: 110, feed: 'Broiler finisher' },
    { from: 5, to: 5, grams: 145, feed: 'Broiler finisher' },
    { from: 6, to: null, grams: 165, feed: 'Broiler finisher' },
  ],
}

export const thresholds = [
  { key: 'mortality', label: 'Mortality alert', value: '0.5', suffix: '% of birds a day' },
  { key: 'feed', label: 'Feed variance tolerance', value: '10', suffix: '± %' },
  { key: 'stock', label: 'Low feed stock', value: '5', suffix: 'days of cover' },
  { key: 'expiry', label: 'Medication expiry warning', value: '30', suffix: 'days ahead' },
  { key: 'cutoff', label: 'Missing entry cut-off', value: '18:00', suffix: 'daily' },
  { key: 'debt', label: 'Overdue debt', value: '60', suffix: 'days' },
]

export const feedTypeSettings = [
  { name: 'Layer mash', bagKg: 25, reorderAt: 100, usedBy: 'Pens 1–4', active: true },
  { name: 'Broiler finisher', bagKg: 25, reorderAt: 60, usedBy: 'Pen 5', active: true },
  { name: 'Broiler starter', bagKg: 25, reorderAt: 30, usedBy: 'Pen 6', active: true },
  { name: 'Grower mash', bagKg: 25, reorderAt: 40, usedBy: '—', active: true },
  { name: 'Chick mash', bagKg: 25, reorderAt: 20, usedBy: '—', active: false },
]

// ── Audit log ──────────────────────────────────────────────────────

export type AuditAction = 'Approval asked' | 'Created' | 'Uploaded' | 'Edited' | 'Setting changed' | 'Adjusted' | 'Deleted' | 'Approved'

export const auditTone: Record<AuditAction, Tone> = {
  'Approval asked': 'warning',
  Created: 'neutral',
  Uploaded: 'neutral',
  Edited: 'info',
  'Setting changed': 'warning',
  Adjusted: 'info',
  Deleted: 'danger',
  Approved: 'success',
}

export type AuditEntry = { when: string; who: string; action: AuditAction; record: string; change: string; reason: string | null }

export const auditLog: AuditEntry[] = [
  { when: '09/10 15:10', who: 'funmi', action: 'Approval asked', record: 'Sale S-1043', change: '₦3,800 a crate, below ₦4,000', reason: null },
  { when: '09/10 11:21', who: 'funmi', action: 'Created', record: 'Sale S-1042', change: '₦168,000 · paid ₦100,000', reason: null },
  { when: '09/10 08:02', who: 'musa', action: 'Uploaded', record: 'Pen 4 entry · 09/10', change: 'Saved offline at 07:46', reason: null },
  { when: '09/10 07:40', who: 'emeka', action: 'Edited', record: 'Pen 1 entry · 08/10', change: 'Feed 4.5 → 4.7 bags', reason: 'Recount at the store' },
  { when: '09/10 07:12', who: 'kemi', action: 'Created', record: 'Pen 2 entry · 09/10', change: 'Died 9 · note added', reason: null },
  { when: '08/10 17:02', who: 'adeola', action: 'Setting changed', record: 'Mortality alert threshold', change: '0.6% → 0.5%', reason: 'Catch problems earlier' },
  { when: '07/10 16:10', who: 'bayo', action: 'Adjusted', record: 'Layer mash stock', change: '−1 bag after a count', reason: 'Bag torn, unusable' },
  { when: '07/10 09:15', who: 'funmi', action: 'Deleted', record: 'Expense E-0331', change: '₦12,000 transport', reason: 'Duplicate of E-0330' },
  { when: '05/10 10:05', who: 'emeka', action: 'Approved', record: 'Sale S-1033', change: '₦3,900 a crate, below minimum', reason: 'Bulk order, 60 crates' },
]
export const AUDIT_TOTAL_THIS_WEEK = 214

// ── Farm profile ───────────────────────────────────────────────────

export const farmProfile = {
  name: 'AyokaFarm',
  tradingAs: 'AyokaFarm Poultry & Eggs',
  address: 'Km 12, Oyo–Ogbomoso Road, Oyo State',
  phone: '0803 ••• 1182',
  email: 'hello@ayokafarm.ng',
  currency: 'Naira (₦)',
  financialYear: 'January – December',
  timezone: 'West Africa Time (WAT)',
  goLive: '01 Jul 2026',
  receiptFooter: 'Thank you for your business',
  whatsappSender: '0803 ••• 1182 · AyokaFarm',
  whatsappLimit: 300,
  whatsappUsed: 53,
}

// ── Lists ──────────────────────────────────────────────────────────

export type ListDef = { id: string; name: string; summary: string; description: string; items: { name: string; detail?: string }[] }

export const lists: ListDef[] = [
  { id: 'products', name: 'Products & minimum prices', summary: '5 products', description: '', items: [] },
  {
    id: 'expense-categories', name: 'Expense categories', summary: '9 categories', description: 'Used by Add expense. Medication and feed are purchases, so they aren’t listed here.',
    items: ['Labour', 'Fuel & power', 'Vet services', 'Transport', 'Repairs', 'Utilities', 'Equipment', 'Security', 'Other'].map((name) => ({ name })),
  },
  {
    id: 'medications', name: 'Medication list', summary: '7 medications', description: 'Each medication’s withdrawal period drives the egg and bird sale warnings.',
    items: [
      { name: 'Vitalyte (Vitamin C)', detail: '0 days withdrawal' },
      { name: 'Amoxicillin 20%', detail: '5 days withdrawal' },
      { name: 'Amprolium 20%', detail: '7 days withdrawal' },
      { name: 'Gumboro (IBD) vaccine', detail: '0 days withdrawal' },
      { name: 'Lasota (ND) vaccine', detail: '0 days withdrawal' },
      { name: 'Piperazine', detail: '7 days withdrawal' },
      { name: 'Virkon S', detail: 'Disinfectant · not given to birds' },
    ],
  },
  { id: 'cull-reasons', name: 'Cull reasons', summary: '4 reasons', description: 'Chosen when birds are removed but didn’t die.', items: ['Sick, culled', 'Injured', 'Not laying', 'Sold live'].map((name) => ({ name })) },
  { id: 'adjust-reasons', name: 'Stock-adjustment reasons', summary: '5 reasons', description: 'A count can only change stock with one of these reasons.', items: ['Bag torn, unusable', 'Spilled', 'Expired', 'Theft suspected', 'Recount'].map((name) => ({ name })) },
  { id: 'payment-methods', name: 'Payment methods', summary: 'Cash · Transfer · POS', description: 'Shown on every payment, sale and purchase.', items: ['Cash', 'Transfer', 'POS'].map((name) => ({ name })) },
  { id: 'customer-types', name: 'Customer types', summary: 'Regular · One-off', description: 'Regular customers get a running statement; one-off buyers pay in full.', items: ['Regular', 'One-off'].map((name) => ({ name })) },
]

export const priceList = [
  { name: 'Eggs · crate of 30', unit: 'crate', minimum: 4000, last: '₦ 4,200 · 09/10', active: true },
  { name: 'Cracked eggs', unit: 'crate', minimum: 2000, last: '₦ 2,500 · 08/10', active: true },
  { name: 'Spent layers', unit: 'bird', minimum: 5000, last: '₦ 5,500 · 09/10', active: true },
  { name: 'Live broilers', unit: 'bird', minimum: 6500, last: '₦ 7,000 · 18/09', active: true },
  { name: 'Droppings', unit: '50 kg bag', minimum: 1200, last: '₦ 1,500 · 05/10', active: true },
]
