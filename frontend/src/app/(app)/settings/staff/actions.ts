'use server'

import { loginEmailFor, normalisePhone } from '../../../../lib/phone'
import { createClient, createSecretClient } from '../../../../lib/supabase/server'

// Staff accounts need Supabase admin rights (the secret key), so these run on the server only.
// Each one first checks who is calling: the secret key bypasses row-level security.
// Changes to profiles and pen assignments are made with the caller's own session, so row-level
// security applies and the audit log records who made them; only login changes use the secret key.

/** What every staff action returns: ok, or a message to show the person. */
type Result = { ok: true } | { ok: false; error: string }

/** Role ids the database accepts for a new account. */
const ROLES = ['owner', 'farm_manager', 'sales_accounts', 'store_keeper', 'pen_attendant', 'pen_attendant_all'] as const
type DbRole = (typeof ROLES)[number]

/** Who is calling and their role, if they're signed in and active. */
async function caller(): Promise<{ id: string; role: string | null } | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const id = data?.claims?.sub
  if (!id) return null
  const { data: profile } = await supabase.from('profiles').select('role_id, is_active').eq('id', id).single()
  return profile?.is_active ? { id, role: profile.role_id } : null
}
/** Just the caller's role, or null if they're signed out or deactivated. */
const callerRole = async () => (await caller())?.role ?? null

const fail = (error: string): Result => ({ ok: false, error })

/**
 * Owner only: create a login for a new staff member, set their role and phone, and, for a pen
 * attendant, the pens they work on. They sign in with their phone and this first password.
 * With `employeeId`, the login is attached to that existing employee instead of a new one.
 */
export async function addStaff(input: { name: string; phone: string; role: string; password: string; whatsapp: boolean; pens: number[]; employeeId?: number }): Promise<Result> {
  if ((await callerRole()) !== 'owner') return fail('Only an owner can add staff.')
  const name = input.name.trim()
  const phone = normalisePhone(input.phone)
  if (!name) return fail('Enter their name.')
  if (!phone) return fail('Enter a valid Nigerian mobile number.')
  if (!ROLES.includes(input.role as DbRole)) return fail('Choose a role.')
  if (input.password.length < 8) return fail('The first password needs at least 8 characters.')

  const admin = createSecretClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: loginEmailFor(phone),
    password: input.password,
    email_confirm: true,
    // The role goes in app_metadata, which only the server can set; the new-user trigger reads it.
    app_metadata: { role: input.role },
    user_metadata: { full_name: name },
  })
  if (error || !data.user) return fail(/already/i.test(error?.message ?? '') ? 'Someone with that phone number already has an account.' : (error?.message ?? 'Couldn’t create the account.'))

  const id = data.user.id
  // Set the role here too: Supabase writes app_metadata just after the insert the new-user trigger sees.
  const db = await createClient()
  const { error: profileError } = await db.from('profiles').update({ role_id: input.role, phone: `+${phone}`, whatsapp_opt_in: input.whatsapp }).eq('id', id)
  if (profileError) return fail(profileError.message)
  if (input.role === 'pen_attendant' && input.pens.length) {
    const { error: pensError } = await db.from('staff_pens').insert(input.pens.map((pen_id) => ({ profile_id: id, pen_id })))
    if (pensError) return fail(pensError.message)
  }
  if (input.employeeId) {
    const { error: linkError } = await db.rpc('link_staff_employee', { profile: id, employee: input.employeeId })
    if (linkError) return fail(`The login was created but couldn’t be linked to ${name}: ${linkError.message}. Link it in Employees.`)
  }
  return { ok: true }
}

/** Owner only: rename a staff member. Their employee record follows (a database trigger copies it). */
export async function renameStaff(profileId: string, fullName: string): Promise<Result> {
  if ((await callerRole()) !== 'owner') return fail('Only an owner can rename staff.')
  const name = fullName.trim()
  if (!name) return fail('Enter their name.')
  const db = await createClient()
  const { error } = await db.from('profiles').update({ full_name: name }).eq('id', profileId)
  if (error) return fail(error.message)
  // The sign-up name in the login itself, so nothing still holds the old one.
  const { error: authError } = await createSecretClient().auth.admin.updateUserById(profileId, { user_metadata: { full_name: name } })
  return authError ? fail(authError.message) : { ok: true }
}

/**
 * Owner only: deactivate or reactivate a staff account. Deactivating also signs them out
 * everywhere. Nobody can deactivate themselves, and the last active owner can't be deactivated.
 */
export async function setStaffActive(profileId: string, active: boolean): Promise<Result> {
  const me = await caller()
  if (me?.role !== 'owner') return fail('Only an owner can deactivate staff.')
  if (me.id === profileId) return fail('You can’t deactivate your own account.')
  const admin = createSecretClient()
  const { data: target } = await admin.from('profiles').select('role_id').eq('id', profileId).single()
  // There can be several owners, but the farm must always keep at least one active.
  if (!active && target?.role_id === 'owner') {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role_id', 'owner').eq('is_active', true)
    if ((count ?? 0) <= 1) return fail('The farm needs at least one active owner.')
  }
  const db = await createClient()
  const { error } = await db.from('profiles').update({ is_active: active }).eq('id', profileId)
  if (error) return fail(error.message)
  // A ban stops their session from refreshing, which signs them out everywhere.
  // 876000h is about 100 years (there is no permanent ban); 'none' lifts it when they're reactivated.
  const { error: banError } = await admin.auth.admin.updateUserById(profileId, { ban_duration: active ? 'none' : '876000h' })
  return banError ? fail(banError.message) : { ok: true }
}

/** Roles whose passwords a farm manager may reset. */
const FARM_MANAGER_RESETS = ['pen_attendant', 'pen_attendant_all', 'store_keeper']

/**
 * Set a new password for a staff member. The owner can reset anyone's; a farm manager only
 * pen attendants' and store keepers'.
 */
export async function resetStaffPassword(profileId: string, password: string): Promise<Result> {
  const role = await callerRole()
  if (role !== 'owner' && role !== 'farm_manager') return fail('Only the owner or farm manager can reset passwords.')
  if (password.length < 8) return fail('The new password needs at least 8 characters.')
  const admin = createSecretClient()
  const { data: target } = await admin.from('profiles').select('role_id').eq('id', profileId).single()
  if (target?.role_id === 'owner' && role !== 'owner') return fail('Only an owner can reset an owner’s password.')
  // A farm manager resets passwords for pen attendants and store keepers only: resetting anyone with
  // wider access (accounts sees payroll and finance) would let them sign in as that person.
  if (role === 'farm_manager' && !FARM_MANAGER_RESETS.includes(target?.role_id ?? '')) {
    return fail('Only the owner can reset this person’s password.')
  }
  const { error } = await admin.auth.admin.updateUserById(profileId, { password })
  return error ? fail(error.message) : { ok: true }
}

/**
 * Owner only: move a staff member to another role. Nobody changes their own role, the last active
 * owner keeps theirs, and pen assignments are cleared when the new role isn't pen-based.
 */
export async function changeStaffRole(profileId: string, roleId: string): Promise<Result> {
  const me = await caller()
  if (me?.role !== 'owner') return fail('Only an owner can change someone’s role.')
  if (me.id === profileId) return fail('You can’t change your own role — ask another owner.')
  const admin = createSecretClient()
  const [{ data: role }, { data: target }] = await Promise.all([
    admin.from('roles').select('id').eq('id', roleId).maybeSingle(),
    admin.from('profiles').select('role_id, is_active').eq('id', profileId).single(),
  ])
  if (!role) return fail('That role doesn’t exist any more.')
  if (!target) return fail('That staff member wasn’t found.')
  if (target.role_id === roleId) return { ok: true }
  if (target.role_id === 'owner' && target.is_active) {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role_id', 'owner').eq('is_active', true)
    if ((count ?? 0) <= 1) return fail('The farm needs at least one active owner.')
  }
  // The role lives in both places: app_metadata (read when the account is created) and the profile (used by RLS).
  const { error: authError } = await admin.auth.admin.updateUserById(profileId, { app_metadata: { role: roleId } })
  if (authError) return fail(authError.message)
  const db = await createClient()
  const { error } = await db.from('profiles').update({ role_id: roleId }).eq('id', profileId)
  if (error) return fail(error.message)
  // Pen assignments only mean something for roles that work on their own pens.
  const { data: production } = await admin.from('role_permissions').select('can_view').eq('role_id', roleId).eq('module', 'production').maybeSingle()
  if (production?.can_view !== 'own') {
    const { error: pensError } = await db.from('staff_pens').delete().eq('profile_id', profileId)
    if (pensError) return fail(pensError.message)
  }
  return { ok: true }
}
