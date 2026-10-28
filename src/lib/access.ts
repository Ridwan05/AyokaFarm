import { roles, type Module } from '../data/settings'
import type { Role, User } from '../data/session'

/** Which permission module guards each area of the app (longest prefix wins). */
const areas: { prefix: string; module: Module | 'reports' | 'deliveries'; label: string; group: string }[] = [
  { prefix: '/deliveries', module: 'deliveries', label: 'Deliveries', group: 'Trade' },
  { prefix: '/inventory/count', module: 'deliveries', label: 'Weekly count', group: 'Operate' },
  { prefix: '/production', module: 'Production', label: 'Production', group: 'Operate' },
  { prefix: '/production/entry', module: 'Production', label: 'Daily entry', group: 'Operate' },
  { prefix: '/pens', module: 'Production', label: 'Pens & flocks', group: 'Operate' },
  { prefix: '/alerts', module: 'Dashboard', label: 'Alerts', group: 'Dashboard' },
  { prefix: '/inventory/medication', module: 'Medication stock', label: 'Medication stock', group: 'Operate' },
  { prefix: '/inventory', module: 'Inventory — feed & eggs', label: 'Inventory', group: 'Operate' },
  { prefix: '/sales', module: 'Sales', label: 'Sales', group: 'Trade' },
  { prefix: '/purchases', module: 'Purchases', label: 'Purchases', group: 'Trade' },
  { prefix: '/expenses', module: 'Expenses', label: 'Expenses', group: 'Trade' },
  { prefix: '/payments', module: 'Payments', label: 'Payments', group: 'Trade' },
  { prefix: '/customers', module: 'Customers & suppliers', label: 'Customers', group: 'People' },
  { prefix: '/suppliers', module: 'Customers & suppliers', label: 'Suppliers', group: 'People' },
  { prefix: '/reports', module: 'reports', label: 'Reports', group: 'Insight' },
  { prefix: '/settings', module: 'Admin & settings', label: 'Settings', group: 'Settings' },
  { prefix: '/go-live', module: 'Admin & settings', label: 'Go-live setup', group: 'Settings' },
]

const areaFor = (path: string) => areas.filter((a) => path === a.prefix || path.startsWith(a.prefix + '/')).sort((a, b) => b.prefix.length - a.prefix.length)[0]

function canView(role: Role, module: Module | 'reports' | 'deliveries') {
  // Receiving deliveries and the weekly count are the Store Keeper's jobs.
  if (module === 'deliveries') return role === 'store-keeper'
  // Reports are for the people who run the farm and its money.
  if (module === 'reports') return role !== 'store-keeper' && role !== 'pen-attendant'
  const p = roles.find((r) => r.id === role)!.permissions[module]
  return p.view !== false
}

/** Pen attendants see only their own pens; everyone who works on production sees all of them. */
export const canSeePen = (user: User, penId: number) => user.pens === 'all' || user.pens.includes(penId)

/** The pen id in /pens/:id or /production/entry/:id, if any. */
const penInPath = (path: string) => {
  const m = path.match(/^\/(?:pens|production\/entry)\/(\d+)(?:\/|$)/)
  return m ? Number(m[1]) : null
}

export function canAccess(path: string, user: User) {
  const { role } = user
  // Every role has a home: the dashboard, or its own start page for the narrower roles.
  if (path === '/') return role === 'pen-attendant' || role === 'store-keeper' || canView(role, 'Dashboard')
  // The farm manager's settings scope is the staff list only.
  if (role === 'farm-manager' && (path.startsWith('/settings') || path === '/go-live')) return path === '/settings/staff'
  // Pen attendants: their pens, production and read-only stock — nothing else.
  if (role === 'pen-attendant' && !(path.startsWith('/pens/') || ['/production', '/inventory'].some((p) => path === p || path.startsWith(p + '/')))) return false
  const pen = penInPath(path)
  if (pen !== null && !canSeePen(user, pen)) return false
  const area = areaFor(path)
  return area ? canView(role, area.module) : true
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
  (user.role === 'owner' || user.role === 'farm-manager' || user.role === 'pen-attendant') && canSeePen(user, penId)

/** Where the Settings item points for each role. */
export const settingsHomeFor = (role: Role) => (role === 'farm-manager' ? '/settings/staff' : '/settings')
