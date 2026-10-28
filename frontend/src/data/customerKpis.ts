import type { Kpi } from '../components/ui/KpiCard'

const rising = [0.08, 0.07, 0.08, 0.08, 0.07, 0.08, 0.12, 0.17]
const good = [84.9, 85.2, 85.0, 85.4, 85.8, 86.0, 86.2, 86.4]

export const customerKpis: Kpi[] = [
  { label: 'Owed to the farm', value: '1.31', unit: 'million ₦', delta: '+5.5%', trend: 'up', sentiment: 'bad', context: '9 customers', info: 'All customer balances', spark: rising },
  { label: 'Over 60 days', value: '212.5', unit: 'thousand ₦', delta: '1 customer', trend: 'up', sentiment: 'bad', context: 'Mama Titi Stores', info: 'Bills unpaid for more than 60 days', spark: rising },
  { label: 'Average days to pay', value: '27', unit: 'days', delta: '−3 days', trend: 'up', sentiment: 'good', context: 'vs September', info: 'Average time from sale to full payment', spark: good },
  { label: 'Paid on time', value: '78', unit: '%', delta: '+4 pts', trend: 'up', sentiment: 'good', context: 'of credit sales', info: 'Credit sales paid within 30 days', spark: good },
]
