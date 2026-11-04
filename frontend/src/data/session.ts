import type { Database } from '../lib/supabase/database.types'

/** Staff roles, in the app's dashed form. */
export type Role = 'owner' | 'farm-manager' | 'sales-accounts' | 'store-keeper' | 'pen-attendant' | 'pen-attendant-all'

/** The signed-in person: who they are, their role and what it allows. */
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

/** A permission module in Roles & permissions. */
export type AppModule = Database['public']['Enums']['app_module']
/** 'none', 'own' (their own records) or 'all'. */
export type AccessLevel = Database['public']['Enums']['access_level']
/** Access for each action on one module. */
export type ModuleAccess = { view: AccessLevel; add: AccessLevel; edit: AccessLevel; delete: AccessLevel }
/** A role's access per module; a missing module means no access. */
export type Permissions = Partial<Record<AppModule, ModuleAccess>>

/** Database role ids use underscores (farm_manager); the app uses dashes (farm-manager). */
export const roleFromDb = (id: string) => id.replace(/_/g, '-') as Role
/** App role → database role id. */
export const roleToDb = (role: Role) => role.replace(/-/g, '_')

/** Today's date on the farm (Africa/Lagos), as YYYY-MM-DD, whatever the device's time zone. */
export function farmTodayISO(now = new Date()) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** The farm's name and today's date, fixed when the app loads. */
export const farm = {
  name: 'AyokaFarm',
  /** Midnight at the start of today on the farm. */
  today: new Date(`${farmTodayISO()}T00:00:00`),
}

/** Up to two initials from a name: "Ada Okafor" → "AO". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
