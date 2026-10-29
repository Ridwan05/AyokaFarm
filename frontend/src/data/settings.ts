import type { Role } from './session'

// Staff and expected-feed bands, filled in place from Supabase when the farm's records load
// (remote.ts). The rest of Settings reads the database directly through useTrade().catalog.

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

export const staff: StaffMember[] = []

// ── Feed & targets ─────────────────────────────────────────────────

export type FeedBand = { from: number; to: number | null; grams: number; feed: string }

/** Defaults until feed_targets load; Settings → Feed & targets edits the real bands. */
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
