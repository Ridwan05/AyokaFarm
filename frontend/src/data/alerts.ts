import type { AlertKind, AlertTone } from '../features/alerts/AlertRow'

// Mock data matching P-D5 · Alerts. Replace with API calls.

export type AlertStatus = 'new' | 'acknowledged' | 'resolved'

export type FarmAlert = {
  id: string
  kind: AlertKind
  tone: AlertTone
  severity: 'Critical' | 'Warning' | 'Info'
  title: string
  /** One-line summary under the title, without the status. */
  summary: string
  time: string
  status: AlertStatus
  acknowledgedBy?: string
  pen?: number
  facts: [label: string, value: string][]
  notified: { name: string; channel: string; state: string }[]
  link: { label: string; to: string }
}

export const alertTypes: Record<AlertKind, string> = {
  mortality: 'Mortality',
  debt: 'Money owed',
  feed: 'Feed use',
  stock: 'Low stock',
  'missing-entry': 'Missing entry',
}

const owners = [
  { name: 'Emeka Nwosu', channel: 'WhatsApp', state: 'Read 07:15' },
  { name: 'Adeola Ogunleye', channel: 'WhatsApp', state: 'Delivered 07:13' },
]

export const farmAlerts: FarmAlert[] = [
  {
    id: 'a1', kind: 'mortality', tone: 'danger', severity: 'Critical', status: 'new', pen: 2,
    title: 'Mortality spike — Pen 2', summary: '9 birds (0.8%) · threshold 0.5%', time: '07:12',
    facts: [
      ['Died today', '9 birds (0.8%)'],
      ['Threshold', '0.5% ≈ 6 birds'],
      ['Last 3 days', '2 · 3 · 9'],
      ['Recorded by', 'Kemi · 07:12'],
      ['Pen note', '“some birds sneezing, water line low”'],
    ],
    notified: owners, link: { label: 'Open Pen 2', to: '/pens/2' },
  },
  {
    id: 'a2', kind: 'debt', tone: 'danger', severity: 'Critical', status: 'new',
    title: 'Debt over 60 days — Mama Titi Stores', summary: '₦212,500 · total owed ₦312,500', time: '06:00',
    facts: [
      ['Over 60 days', '₦212,500'],
      ['Total owed', '₦312,500'],
      ['Last payment', '02 Oct'],
      ['Credit limit', '₦300,000'],
    ],
    notified: [owners[1]], link: { label: 'Open customer', to: '/customers' },
  },
  {
    id: 'a3', kind: 'feed', tone: 'warning', severity: 'Warning', status: 'acknowledged', acknowledgedBy: 'Emeka', pen: 6,
    title: 'Feed 14% above expected — Pen 6', summary: '172 kg vs 151 kg', time: 'Yesterday',
    facts: [
      ['Used', '172 kg'],
      ['Expected', '151 kg for 1,262 birds'],
      ['Tolerance', '±10%'],
      ['Recorded by', 'Tunde · 06:51'],
    ],
    notified: owners, link: { label: 'Open Pen 6', to: '/pens/6' },
  },
  {
    id: 'a4', kind: 'stock', tone: 'warning', severity: 'Warning', status: 'new',
    title: 'Layer mash — 4 days of cover', summary: '82 bags · reorder level 100', time: '08:00',
    facts: [
      ['In store', '82 bags'],
      ['Reorder level', '100 bags'],
      ['Average use', '21 bags/day'],
      ['Days of cover', '4 days'],
    ],
    notified: owners, link: { label: 'Open feed stock', to: '/inventory/feed' },
  },
  {
    id: 'a5', kind: 'missing-entry', tone: 'info', severity: 'Info', status: 'new', pen: 5,
    title: 'Pen 5 — yesterday’s entry missing', summary: 'Late entry allowed until Sat', time: '08:00',
    facts: [
      ['Missing day', 'Thu 08 Oct'],
      ['Assigned to', 'Musa'],
      ['Late entry until', 'Sat 10 Oct'],
    ],
    notified: [{ name: 'Musa Ibrahim', channel: 'WhatsApp', state: 'Delivered 08:00' }], link: { label: 'Open Pen 5', to: '/pens/5' },
  },
]

export type ResolvedAlert = {
  title: string
  where: string
  raised: string
  resolvedBy: string
  note: string
}

export const resolvedThisWeek: ResolvedAlert[] = [
  { title: 'Feed 12% below expected', where: 'Pen 3', raised: 'Fri 02/10', resolvedBy: 'Emeka · 02/10 16:40', note: 'Feeder trough repaired' },
  { title: 'Gumboro vaccine expiring in 21 days', where: 'Medication', raised: 'Sat 03/10', resolvedBy: 'Bayo · 06/10 09:10', note: 'Batch used in Pen 6 vaccination' },
  { title: 'Entry missing', where: 'Pen 1', raised: 'Mon 05/10', resolvedBy: 'Chidi · 05/10 19:10', note: 'Entered late (flagged)' },
]

export const whatsappRecipients = 4
