import type { Tone } from '../components/ui/Badge'
import type { Kpi } from '../components/ui/KpiCard'
import type { AlertKind, AlertTone } from '../features/alerts/AlertRow'

// Mock data matching the Figma dashboard (P-D1). Replace with API calls.

export const kpis: Kpi[] = [
  {
    label: 'Live birds',
    value: '7,622',
    unit: 'birds',
    delta: 'No change',
    trend: 'flat',
    sentiment: 'neutral',
    context: '6 pens',
    info: 'Birds alive across all active pens',
    spark: [7622, 7622, 7622, 7622, 7622, 7622, 7622],
  },
  {
    label: 'Laying rate',
    value: '86.4',
    unit: '%',
    delta: '+1.2 pts',
    trend: 'up',
    sentiment: 'good',
    context: 'vs 7-day avg',
    info: 'Eggs collected ÷ laying hens, layer pens only',
    spark: [84.9, 85.2, 85.0, 85.4, 85.8, 86.0, 86.2, 86.4],
  },
  {
    label: 'Mortality today',
    value: '0.17',
    unit: '%',
    delta: '+0.09 pts',
    trend: 'up',
    sentiment: 'bad',
    context: 'Pen 2 spike',
    info: 'Birds died today ÷ live birds',
    spark: [0.08, 0.07, 0.08, 0.08, 0.07, 0.08, 0.12, 0.17],
  },
  {
    label: 'Sales this week',
    value: '2.84',
    unit: 'million ₦',
    delta: '+6.2%',
    trend: 'up',
    sentiment: 'good',
    context: 'vs last week',
    info: 'Approved sales since Monday',
    spark: [2.5, 2.55, 2.52, 2.6, 2.68, 2.72, 2.8, 2.84],
  },
]

export type Alert = {
  id: string
  kind: AlertKind
  tone: AlertTone
  title: string
  detail: string
  time: string
  to: string
}

export const alerts: Alert[] = [
  {
    id: 'a1',
    kind: 'mortality',
    tone: 'danger',
    title: 'Mortality spike — Pen 2',
    detail: '9 birds (0.8%) today · threshold 0.5% · Emeka notified',
    time: '07:12',
    to: '/pens/2',
  },
  {
    id: 'a2',
    kind: 'debt',
    tone: 'danger',
    title: 'Mama Titi Stores — ₦212,500 over 60 days',
    detail: 'Total owed ₦312,500 · last payment 02 Oct',
    time: 'Today',
    to: '/customers',
  },
  {
    id: 'a3',
    kind: 'feed',
    tone: 'warning',
    title: 'Feed 14% above expected — Pen 6',
    detail: '172 kg used vs 151 kg expected for 1,262 birds',
    time: 'Yesterday',
    to: '/pens/6',
  },
  {
    id: 'a4',
    kind: 'stock',
    tone: 'warning',
    title: 'Layer mash — 4 days of cover left',
    detail: '82 bags in store · reorder level 100 bags',
    time: '08:00',
    to: '/inventory',
  },
  {
    id: 'a5',
    kind: 'missing-entry',
    tone: 'info',
    title: 'Pen 5 — yesterday’s entry is missing',
    detail: 'Musa assigned · can be added as a late entry',
    time: '08:00',
    to: '/production',
  },
]

export type FeedStock = {
  name: string
  bags: number
  /** Days of cover; null when the feed isn't in use. */
  days: number | null
}

export const feedStock: FeedStock[] = [
  { name: 'Layer mash', bags: 82, days: 4 },
  { name: 'Broiler finisher', bags: 96, days: 8 },
  { name: 'Grower mash', bags: 62, days: null },
  { name: 'Broiler starter', bags: 84, days: 14 },
]

/** Days of cover that fill the bar. */
export const FEED_COVER_FULL_DAYS = 15
/** At or below this many days, cover shows as a warning. */
export const FEED_COVER_WARN_DAYS = 5

// 30 days of feed use (kg/day), deterministic so renders are stable.
const expected = Array.from({ length: 30 }, (_, i) => 940 + (35 * i) / 29)
const noise = [
  -12, 4, -8, 10, -4, 14, -6, 2, 16, -10, 8, -2, 18, 0, 12, -6, 20, 6, 14, 26, 10, 30, 18, 34, 24,
  40, 32, 48, 44, 54,
]
const actual = expected.map((e, i) => Math.round(e - 22 + noise[i]))

export const feedSeries = {
  expected,
  actual,
  lower: expected.map((e) => e * 0.9),
  upper: expected.map((e) => e * 1.1),
  xLabels: ['10 Sep', '17 Sep', '24 Sep', '01 Oct', '09 Oct'],
  yTicks: [800, 900, 1000, 1100],
  todayDelta: '+5.5% today',
  summary: 'Within tolerance overall — driven by Pen 6 (+14%)',
}

export const receivables = {
  total: '₦1.24M',
  customers: 9,
  buckets: [
    { label: '0–30 days', amount: 620000, color: 'bg-chart-1' },
    { label: '31–60 days', amount: 407500, color: 'bg-chart-2' },
    { label: '60+ days', amount: 212500, color: 'bg-chart-4', overdue: true },
  ],
  suppliers: { total: 455000, count: 3, note: 'nothing overdue' },
}

export type PenToday = {
  id: number
  initials: string
  name: string
  flock: string
  birds: number
  /** null = not recorded yet */
  died: number | null
  feedVsExpected: number | null
  layingRate: number | null
  entry: { tone: Tone; label: string }
}

export const pensToday: PenToday[] = [
  { id: 1, initials: 'P1', name: 'Pen 1 · Layers', flock: 'L-2511 · week 58', birds: 1020, died: 0, feedVsExpected: 2.0, layingRate: 78.4, entry: { tone: 'success', label: 'Recorded 06:40' } },
  { id: 2, initials: 'P2', name: 'Pen 2 · Layers', flock: 'L-2602 · week 31', birds: 1108, died: 9, feedVsExpected: 3.1, layingRate: 90.1, entry: { tone: 'success', label: 'Recorded 07:12' } },
  { id: 3, initials: 'P3', name: 'Pen 3 · Layers', flock: 'L-2540 · week 34', birds: 1204, died: 1, feedVsExpected: -4.0, layingRate: 89.7, entry: { tone: 'success', label: 'Recorded 06:58' } },
  { id: 4, initials: 'P4', name: 'Pen 4 · Layers', flock: 'L-2604 · week 22', birds: 1180, died: null, feedVsExpected: null, layingRate: null, entry: { tone: 'neutral', label: 'Due by 18:00' } },
  { id: 5, initials: 'P5', name: 'Pen 5 · Broilers', flock: 'B-2636 · week 5', birds: 1850, died: null, feedVsExpected: null, layingRate: null, entry: { tone: 'danger', label: 'Late · yesterday' } },
  { id: 6, initials: 'P6', name: 'Pen 6 · Broilers', flock: 'B-2639 · week 3', birds: 1262, died: 1, feedVsExpected: 14.0, layingRate: null, entry: { tone: 'success', label: 'Recorded 06:51' } },
]

/** Thresholds that turn table figures amber/red. */
export const FEED_DEVIATION_WARN_PCT = 10
export const MORTALITY_SPIKE_BIRDS = 5
