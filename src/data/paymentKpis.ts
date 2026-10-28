import type { Kpi } from '../components/ui/KpiCard'

const flat = [1, 1, 1, 1, 1, 1, 1]

export const paymentKpis: Kpi[] = [
  { label: 'Received this week', value: '390', unit: 'thousand ₦', delta: '+22%', trend: 'up', sentiment: 'good', context: 'vs last week', info: 'Payments received outside a sale, this week', spark: [84.9, 85.2, 85.0, 85.4, 85.8, 86.0, 86.2, 86.4] },
  { label: 'By transfer', value: '72', unit: '%', delta: 'Transfer', trend: 'flat', sentiment: 'neutral', context: 'cash 15% · POS 13%', info: 'Share of this week’s payments by method', spark: flat },
  { label: 'Paid to suppliers', value: '500', unit: 'thousand ₦', delta: '1 payment', trend: 'flat', sentiment: 'neutral', context: 'Greenfield Feeds', info: 'Payments made to suppliers this week', spark: flat },
  { label: 'Still owed to the farm', value: '1.31', unit: 'million ₦', delta: '+5.5%', trend: 'up', sentiment: 'bad', context: 'after today’s sales', info: 'All customer balances', spark: [0.08, 0.07, 0.08, 0.08, 0.07, 0.08, 0.12, 0.17] },
]
