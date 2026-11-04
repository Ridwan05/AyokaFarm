import {
  Banknote,
  Landmark,
  Egg,
  FileText,
  HandCoins,
  IdCard,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Store,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { Role, User } from '../../data/session'
import { canAccess, isAttendant } from '../../lib/access'

/** One sidebar link. */
export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
}

/** A labelled section of sidebar links; the first group has no label. */
export type NavGroup = {
  label?: string
  items: NavItem[]
}

/** Full sidebar for office roles. Each user still only sees the items their role can open. */
export const navGroups: NavGroup[] = [
  { items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }] },
  {
    label: 'Operate',
    items: [
      { label: 'Production', to: '/production', icon: Egg },
      { label: 'Pens & flocks', to: '/pens', icon: Warehouse },
      // /inventory redirects to the feed tab (next.config.ts).
      { label: 'Inventory', to: '/inventory', icon: Package },
    ],
  },
  {
    label: 'Trade',
    items: [
      { label: 'Sales', to: '/sales', icon: Receipt },
      { label: 'Purchases', to: '/purchases', icon: Truck },
      { label: 'Expenses', to: '/expenses', icon: Wallet },
      { label: 'Payments', to: '/payments', icon: Banknote },
      { label: 'Deliveries', to: '/deliveries', icon: Truck },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Customers', to: '/customers', icon: Users },
      { label: 'Suppliers', to: '/suppliers', icon: Store },
      { label: 'Employees', to: '/employees', icon: IdCard },
      { label: 'Payroll', to: '/payroll', icon: HandCoins },
    ],
  },
  {
    label: 'Insight',
    items: [
      { label: 'Reports', to: '/reports', icon: FileText },
      { label: 'Finance', to: '/finance', icon: Landmark },
    ],
  },
]

/** Pen attendants work from their pens list, so it replaces both the dashboard and Pens & flocks. */
const penAttendantNav: NavGroup[] = [
  { items: [{ label: 'My pens', to: '/', icon: Warehouse }] },
  {
    label: 'Operate',
    items: [
      { label: 'Production', to: '/production', icon: Egg },
      { label: 'Inventory', to: '/inventory', icon: Package },
    ],
  },
]

/** Sidebar groups for a role, before per-module permission filtering. */
export function navFor(role: Role): NavGroup[] {
  if (isAttendant(role)) return penAttendantNav
  // The store keeper's home is the store-today view, so their first link is renamed.
  if (role === 'store-keeper') return [{ items: [{ label: 'Store today', to: '/', icon: LayoutDashboard }] }, ...navGroups.slice(1)]
  return navGroups
}

/** Settings sits apart, at the bottom of the sidebar. */
export const settingsItem: NavItem = { label: 'Settings', to: '/settings', icon: Settings }

/** Users only see modules their role allows (BRD §4), driven by Roles & permissions. */
export function canSee(item: NavItem, user: User) {
  return canAccess(item.to, user)
}
