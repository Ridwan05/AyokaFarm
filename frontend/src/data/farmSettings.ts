// The farm's settings (farm_settings in Supabase). Filled in place when the farm's records load,
// so any module that imports `farmSettings` reads the saved values. Defaults match the database.

export const farmSettings = {
  farmName: 'AyokaFarm',
  tradingAs: null as string | null,
  address: null as string | null,
  phone: null as string | null,
  email: null as string | null,
  currency: 'NGN',
  timeZone: 'Africa/Lagos',
  financialYearStartMonth: 1,
  goLiveDate: null as string | null,
  receiptFooter: null as string | null,
  whatsappSender: null as string | null,
  whatsappMonthlyLimit: null as number | null,
  /** Deaths above this % of the opening birds raise an alert. */
  mortalityAlertPct: 0.5,
  /** Feed used more than ± this % off the expected amount is flagged. */
  feedVariancePct: 10,
  /** Feed with this many days of cover or fewer is low. */
  lowStockDays: 5,
  /** Medication batches expiring within this many days are flagged. */
  expiryWarningDays: 30,
  /** Daily entries are due by this time (HH:MM). */
  missingEntryCutoff: '18:00',
  /** Customer debts older than this many days are overdue. */
  overdueDebtDays: 60,
  eggsPerCrate: 30,
  /** Non-managers can edit their own records for this many days after creating them (0 = same day). */
  editWindowDays: 0,
}

export type FarmSettings = typeof farmSettings
