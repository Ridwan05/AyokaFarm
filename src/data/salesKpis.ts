import type { Kpi } from '../components/ui/KpiCard'

export const salesKpis: Kpi[] = [
  { label: 'Sales this week', value: '3.01', unit: 'million ₦', delta: '+6.2%', trend: 'up', sentiment: 'good', context: 'vs last week', info: 'Approved sales since Monday', spark: [2.5, 2.55, 2.52, 2.6, 2.68, 2.72, 2.8, 2.84] },
  { label: 'Eggs sold', value: '612', unit: 'crates', delta: '+18 cr', trend: 'flat', sentiment: 'neutral', context: 'avg ₦4,150 a crate', info: 'Crates sold since Monday', spark: [612, 612, 612, 612, 612, 612, 612] },
  { label: 'Sold on credit', value: '742', unit: 'thousand ₦', delta: '+11%', trend: 'up', sentiment: 'bad', context: 'unpaid at sale', info: 'Value of sales not paid at the time of sale', spark: [0.08, 0.07, 0.08, 0.08, 0.07, 0.08, 0.12, 0.17] },
  { label: 'Collected', value: '2.27', unit: 'million ₦', delta: '75%', trend: 'up', sentiment: 'good', context: 'of this week’s sales', info: 'Payments received against this week’s sales', spark: [84.9, 85.2, 85.0, 85.4, 85.8, 86.0, 86.2, 86.4] },
]
