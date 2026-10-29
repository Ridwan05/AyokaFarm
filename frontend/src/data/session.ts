import type { Database } from '../lib/supabase/database.types'

export type Role = 'owner' | 'farm-manager' | 'sales-accounts' | 'store-keeper' | 'pen-attendant' | 'pen-attendant-all'

export type User = {
  /** Supabase auth user id (= profiles.id). */
  id: string
  name: string
  initials: string
  role: Role
  roleLabel: string
  /** Pens this person works in. Pen attendants only see these. */
  pens: number[] | 'all'
  /** What the role allows per module, from role_permissions (Settings → Roles & permissions). */
  permissions: Permissions
}

export type AppModule = Database['public']['Enums']['app_module']
export type AccessLevel = Database['public']['Enums']['access_level']
export type ModuleAccess = { view: AccessLevel; add: AccessLevel; edit: AccessLevel; delete: AccessLevel }
export type Permissions = Partial<Record<AppModule, ModuleAccess>>

/** Database role ids use underscores (farm_manager); the app uses dashes (farm-manager). */
export const roleFromDb = (id: string) => id.replace(/_/g, '-') as Role
export const roleToDb = (role: Role) => role.replace(/-/g, '_')

/** Today's date on the farm (Africa/Lagos), as YYYY-MM-DD. */
export function farmTodayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export const farm = {
  name: 'AyokaFarm',
  /** Midnight at the start of today on the farm. */
  today: new Date(`${farmTodayISO()}T00:00:00`),
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
