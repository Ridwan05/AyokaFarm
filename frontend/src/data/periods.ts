import { inRange, period as periodRange, type PeriodKey, type Range } from './metrics'

/** The period choices every list's Period dropdown offers (Expenses, Sales, Deliveries, Purchases). */
export const PERIODS = ['Today', 'This week', 'Last week', 'This month', 'Last month', 'This year'] as const
/** One of PERIODS. */
export type Period = (typeof PERIODS)[number]
const PERIOD_KEY: Record<Period, PeriodKey> = { Today: 'today', 'This week': 'week', 'Last week': 'last-week', 'This month': 'month', 'Last month': 'last-month', 'This year': 'ytd' }

/** The dates a period filter covers. */
export const rangeOf = (p: Period): Range => periodRange(PERIOD_KEY[p])

/** Extra choice for lists that can show everything. */
export const ALL_TIME = 'All time'
/** PERIODS with "All time" first. */
export const PERIODS_OR_ALL = [ALL_TIME, ...PERIODS] as const
/** One of PERIODS_OR_ALL. */
export type PeriodOrAll = (typeof PERIODS_OR_ALL)[number]

/** The dates a period covers, or null for All time (no date filter). */
export const rangeOrAll = (p: PeriodOrAll): Range | null => (p === ALL_TIME ? null : rangeOf(p))
/** Whether an ISO date passes a period filter; everything passes All time. */
export const inPeriod = (iso: string, r: Range | null) => r === null || inRange(iso, r)
