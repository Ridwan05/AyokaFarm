import { dayMonth, niceTicks } from './metrics'
import type { DailyRow } from './remote'
import { farmTodayISO } from './session'

// Small helpers shared by the reports.

/** n evenly spaced date labels ("09 Oct") for a chart's x axis. */
export function axisLabels(dates: string[], n = 5) {
  if (dates.length <= n) return dates.map(dayMonth)
  return Array.from({ length: n }, (_, i) => dayMonth(dates[Math.round((i * (dates.length - 1)) / (n - 1))]))
}

/** Axis ticks for values, padded a little so lines don't sit on the edge. */
export function ticksFor(values: number[], count = 4) {
  const v = values.filter((x) => Number.isFinite(x))
  if (!v.length) return [0, 1]
  return niceTicks(Math.min(...v), Math.max(...v), count)
}

/** An entry saved after its day had ended (Lagos time) counts as late. */
export const isLate = (d: DailyRow) => (d.createdAt ? farmTodayISO(new Date(d.createdAt)) > d.date : false)
