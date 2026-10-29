import { farmSettings } from '../../data/farmSettings'
import type { AppModule, User } from '../../data/session'
import { farmTodayISO } from '../../data/session'
import type { MoneyKind } from '../../data/tradeContext'
import { accessOf } from '../../lib/access'

// Who may correct or void a money record, mirroring the database rules (private.within_edit_window
// and the soft_delete trigger) so the buttons only show when the save will be accepted.

export const MODULE_OF: Record<MoneyKind, AppModule> = { sales: 'sales', purchases: 'purchases', payments: 'payments', expenses: 'expenses' }

/** The farm's date of a timestamp (Africa/Lagos). */
const farmDate = (ts: string) => farmTodayISO(new Date(ts))

const isManager = (user: User) => user.role === 'owner' || user.role === 'farm-manager'

/**
 * Edit permission for the module, and either a manager, or the person who recorded it within the
 * edit window (same day when the window is 0 days).
 */
export function canEditRecord(user: User, kind: MoneyKind, row: { recorded_by: string; created_at: string } | undefined) {
  if (!row) return false
  // Purchases: the store keeper's 'own' access is for receiving deliveries, not editing purchases.
  const level = accessOf(user, MODULE_OF[kind], 'edit')
  if (level === 'none' || (kind === 'purchases' && level !== 'all')) return false
  if (isManager(user)) return true
  const days = Math.round((Date.parse(farmTodayISO()) - Date.parse(farmDate(row.created_at))) / 86_400_000)
  return row.recorded_by === user.id && days <= farmSettings.editWindowDays
}

/** Voiding (soft delete with a reason) needs delete permission for the module — the owner by default. */
export const canVoidRecord = (user: User, kind: MoneyKind) => accessOf(user, MODULE_OF[kind], 'delete') !== 'none'

export const KIND_LABEL: Record<MoneyKind, string> = { sales: 'sale', purchases: 'purchase', payments: 'payment', expenses: 'expense' }
