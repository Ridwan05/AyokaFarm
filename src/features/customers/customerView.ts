import type { Tone } from '../../components/ui/Badge'
import { daysBetween, type Bill } from '../../data/ledger'

export function customerStatus(bills: Bill[]): { tone: Tone; label: string } {
  if (bills.length === 0) return { tone: 'success', label: 'Paid up' }
  const days = daysBetween(bills[0].date)
  if (days > 60) return { tone: 'danger', label: 'Overdue' }
  if (days > 30) return { tone: 'warning', label: '31–60 days' }
  return { tone: 'neutral', label: 'Owing' }
}

export const oldestDays = (bills: Bill[]) => (bills.length ? daysBetween(bills[0].date) : null)

export const agingLegend = [
  { key: 'current', label: '0–30 days', dot: 'bg-chart-1' },
  { key: 'days31to60', label: '31–60 days', dot: 'bg-chart-2' },
  { key: 'over60', label: '60+ days', dot: 'bg-chart-4' },
] as const
