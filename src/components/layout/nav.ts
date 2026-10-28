import {
  Banknote,
  Egg,
  FileText,
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
import { canAccess } from '../../lib/access'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  { items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }] },
  {
    label: 'Operate',
    items: [
      { label: 'Production', to: '/production', icon: Egg },
      { label: 'Pens & flocks', to: '/pens', icon: Warehouse },
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
    ],
  },
  {
    label: 'Insight',
    items: [{ label: 'Reports', to: '/reports', icon: FileText }],
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

export function navFor(role: Role): NavGroup[] {
  if (role === 'pen-attendant') return penAttendantNav
  if (role === 'store-keeper') return [{ items: [{ label: 'Store today', to: '/', icon: LayoutDashboard }] }, ...navGroups.slice(1)]
  return navGroups
}

export const settingsItem: NavItem = { label: 'Settings', to: '/settings', icon: Settings }

/** Users only see modules their role allows (BRD §4), driven by Roles & permissions. */
export function canSee(item: NavItem, user: User) {
  return canAccess(item.to, user)
}
