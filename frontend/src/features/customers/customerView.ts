import type { Tone } from '../../components/ui/Badge'
import { farmSettings } from '../../data/farmSettings'
import { daysBetween, type Bill } from '../../data/ledger'
import { agingLabels } from '../../data/moneyKpis'

/** Status from the oldest unpaid bill, using the overdue limit in Settings. */
export function customerStatus(bills: Bill[]): { tone: Tone; label: string } {
  if (bills.length === 0) return { tone: 'success', label: 'Paid up' }
  const days = daysBetween(bills[0].date)
  const labels = agingLabels()
  if (days > farmSettings.overdueDebtDays) return { tone: 'danger', label: 'Overdue' }
  if (days > Math.min(30, farmSettings.overdueDebtDays)) return { tone: 'warning', label: labels.days31to60 }
  return { tone: 'neutral', label: 'Owing' }
}

export const oldestDays = (bills: Bill[]) => (bills.length ? daysBetween(bills[0].date) : null)

/** Legend for the ageing bar (labels follow the overdue limit in Settings). */
export function agingLegend() {
  const labels = agingLabels()
  return [
    { key: 'current', label: labels.current, dot: 'bg-chart-1' },
    { key: 'days31to60', label: labels.days31to60, dot: 'bg-chart-2' },
    { key: 'over60', label: labels.over60, dot: 'bg-chart-4' },
  ] as const
}
