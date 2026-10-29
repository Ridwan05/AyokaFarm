import type { AccessLevel, AppModule, ModuleAccess, Role, User } from '../data/session'

/** Pen attendants, whether they cover assigned pens or every pen. */
export const isAttendant = (role: Role) => role === 'pen-attendant' || role === 'pen-attendant-all'

/** The permission modules, in the order Settings → Roles & permissions lists them. */
export const modules: { id: AppModule; label: string }[] = [
  { id: 'production', label: 'Production' },
  { id: 'inventory', label: 'Inventory — feed & eggs' },
  { id: 'medication', label: 'Medication stock' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Sales' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'payments', label: 'Payments' },
  { id: 'parties', label: 'Customers & suppliers' },
  { id: 'admin', label: 'Admin & settings' },
]

type Area = AppModule | 'reports' | 'deliveries'

/** Which permission module guards each area of the app (longest prefix wins). */
const areas: { prefix: string; module: Area; label: string; group: string }[] = [
  { prefix: '/deliveries', module: 'deliveries', label: 'Deliveries', group: 'Trade' },
  { prefix: '/inventory/count', module: 'deliveries', label: 'Weekly count', group: 'Operate' },
  { prefix: '/production', module: 'production', label: 'Production', group: 'Operate' },
  { prefix: '/production/entry', module: 'production', label: 'Daily entry', group: 'Operate' },
  { prefix: '/pens', module: 'production', label: 'Pens & flocks', group: 'Operate' },
  { prefix: '/alerts', module: 'dashboard', label: 'Alerts', group: 'Dashboard' },
  { prefix: '/inventory/medication', module: 'medication', label: 'Medication stock', group: 'Operate' },
  { prefix: '/inventory', module: 'inventory', label: 'Inventory', group: 'Operate' },
  { prefix: '/sales', module: 'sales', label: 'Sales', group: 'Trade' },
  { prefix: '/purchases', module: 'purchases', label: 'Purchases', group: 'Trade' },
  { prefix: '/expenses', module: 'expenses', label: 'Expenses', group: 'Trade' },
  { prefix: '/payments', module: 'payments', label: 'Payments', group: 'Trade' },
  { prefix: '/customers', module: 'parties', label: 'Customers', group: 'People' },
  { prefix: '/suppliers', module: 'parties', label: 'Suppliers', group: 'People' },
  { prefix: '/reports', module: 'reports', label: 'Reports', group: 'Insight' },
  { prefix: '/settings', module: 'admin', label: 'Settings', group: 'Settings' },
  { prefix: '/go-live', module: 'admin', label: 'Go-live setup', group: 'Settings' },
]

const areaFor = (path: string) => areas.filter((a) => path === a.prefix || path.startsWith(a.prefix + '/')).sort((a, b) => b.prefix.length - a.prefix.length)[0]

/** The user's access level for a module and action, from Roles & permissions. */
export const accessOf = (user: User, module: AppModule, action: keyof ModuleAccess = 'view'): AccessLevel => user.permissions[module]?.[action] ?? 'none'

/** True when the role allows the action at all (own or all). */
export const can = (user: User, module: AppModule, action: keyof ModuleAccess = 'view') => accessOf(user, module, action) !== 'none'

function canView(user: User, module: Area) {
  // Receiving deliveries and the weekly count: roles that see only their own side of purchases (the store keeper).
  if (module === 'deliveries') return accessOf(user, 'purchases') === 'own'
  // Reports are for the people who run the farm and its money.
  if (module === 'reports') return user.role !== 'store-keeper' && !isAttendant(user.role) && can(user, 'dashboard')
  // "Own" purchases means receiving deliveries, not the purchases list.
  if (module === 'purchases') return accessOf(user, 'purchases') === 'all'
  return can(user, module)
}

/** Pen attendants see only their assigned pens; everyone else who works on production sees all of them. */
export const canSeePen = (user: User, penId: number) => user.pens === 'all' || user.pens.includes(penId)

/** The pen id in /pens/:id or /production/entry/:id, if any. */
const penInPath = (path: string) => {
  const m = path.match(/^\/(?:pens|production\/entry)\/(\d+)(?:\/|$)/)
  return m ? Number(m[1]) : null
}

export function canAccess(path: string, user: User) {
  const { role } = user
  // Every role has a home: the dashboard, or its own start page for the narrower roles.
  if (path === '/') return true
  // The farm manager's settings scope is the staff list only.
  if (role === 'farm-manager' && (path.startsWith('/settings') || path === '/go-live')) return path === '/settings/staff'
  // Pen attendants: their pens, production and read-only stock — nothing else.
  if (isAttendant(role) && !(path.startsWith('/pens/') || ['/production', '/inventory'].some((p) => path === p || path.startsWith(p + '/')))) return false
  const pen = penInPath(path)
  if (pen !== null && !canSeePen(user, pen)) return false
  const area = areaFor(path)
  return area ? canView(user, area.module) : true
}

/** Breadcrumb group and page name for the "not part of your role" screen. */
export function describeArea(path: string) {
  const area = areaFor(path)
  return area ? { group: area.group, label: area.label } : { group: '', label: 'This page' }
}

/** Below-minimum sales wait for the farm manager or owner (FR-SAL-5). */
export const canApprove = (role: Role) => role === 'owner' || role === 'farm-manager'

/** Who can record a pen's daily entry: its attendant, the farm manager or the owner. */
export const canRecordProduction = (user: User, penId: number) =>
  (user.role === 'owner' || user.role === 'farm-manager' || isAttendant(user.role)) && canSeePen(user, penId)

/** Where the Settings item points for each role. */
export const settingsHomeFor = (role: Role) => (role === 'farm-manager' ? '/settings/staff' : '/settings')

/** Owner-level settings changes (RLS: admin add/edit). */
export const canEditSettings = (user: User) => accessOf(user, 'admin', 'edit') !== 'none'
