import type { FarmAlert } from './alerts'
import type { Alert } from './dashboard'
import { formatDayMon } from '../lib/format'
import type { Catalog } from './remote'

// Small helpers shared by the dashboard, production and pen screens.

/** Pen display name from the catalog, e.g. "Pen 2". */
export const penName = (catalog: Catalog, penId: number) => catalog.pens.find((p) => p.id === penId)?.name ?? `Pen ${penId}`

/** "Layers" / "Broilers" for a pen. */
export const penKind = (catalog: Catalog, penId: number) => (catalog.pens.find((p) => p.id === penId)?.bird_types?.lays_eggs ? 'Layers' : 'Broilers')

/** An alert as a dashboard row. */
export const alertRow = (a: FarmAlert): Alert => ({ id: a.id, kind: a.kind, tone: a.tone, title: a.title, detail: a.summary, time: a.time, to: a.link.to })

/** About `count` evenly spaced labels for a daily series, oldest to newest. */
export function dateLabels(dates: string[], count = 5) {
  if (dates.length <= count) return dates.map(formatDayMon)
  const step = (dates.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => formatDayMon(dates[Math.round(i * step)]))
}
