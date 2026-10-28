import type { Kpi } from '../components/ui/KpiCard'

const flat = [1, 1, 1, 1, 1, 1, 1]

export const supplierKpis: Kpi[] = [
  { label: 'We owe', value: '455', unit: 'thousand ₦', delta: '3 suppliers', trend: 'flat', sentiment: 'neutral', context: 'nothing overdue', info: 'Unpaid purchases and supplier expenses', spark: flat },
  { label: 'Credit with suppliers', value: '20', unit: 'thousand ₦', delta: 'Sunshine', trend: 'up', sentiment: 'good', context: 'overpaid on PF-0409', info: 'Money suppliers hold for us', spark: [84.9, 85.2, 85.0, 85.4, 85.8, 86.0, 86.2, 86.4] },
  { label: 'Bought this month', value: '3.11', unit: 'million ₦', delta: '+4%', trend: 'flat', sentiment: 'neutral', context: 'vs September', info: 'Purchases in October', spark: flat },
  { label: 'Active suppliers', value: '6', unit: '', delta: 'No change', trend: 'flat', sentiment: 'neutral', context: '4 kinds of supply', info: 'Suppliers used in the last 90 days', spark: flat },
]
