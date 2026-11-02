import type { FarmAlert } from './alerts'
import type { Alert } from './dashboard'
import { formatDayMon } from '../lib/format'
import type { Catalog, History } from './remote'

// Small helpers shared by the dashboard, production and pen screens.

/** Pen display name from the catalog, e.g. "Pen 2". Always use this, never `Pen ${id}`: the owner can rename pens. */
export const penName = (catalog: Pick<Catalog, 'pens' | 'allPens'>, penId: number) =>
  (catalog.pens.find((p) => p.id === penId) ?? catalog.allPens.find((p) => p.id === penId))?.name ?? `Pen ${penId}`

/** Another pen (in use or not) already has this name? Names are unique; case and spaces don't count. */
export function penNameTaken(catalog: Pick<Catalog, 'allPens'>, name: string, exceptId?: number) {
  const key = name.trim().replace(/\s+/g, ' ').toLowerCase()
  return catalog.allPens.some((p) => p.id !== exceptId && p.name.trim().replace(/\s+/g, ' ').toLowerCase() === key)
}

/** "Pen 1" / "Pens 1, 2 and 3" by name. */
export function penList(catalog: Pick<Catalog, 'pens' | 'allPens'>, penIds: number[]) {
  const names = penIds.map((id) => penName(catalog, id))
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Layers" / "Broilers" for a pen, by the flock in it now. For past records use `penKindIn` or the row's flock. */
export const penKind = (catalog: Catalog, penId: number) => (catalog.pens.find((p) => p.id === penId)?.bird_types?.lays_eggs ? 'Layers' : 'Broilers')

type FlockRow = History['flocks'][number]

/** Does this flock lay eggs? */
export const flockLays = (catalog: Pick<Catalog, 'birdTypes'>, flock: Pick<FlockRow, 'bird_type_id'> | undefined) =>
  Boolean(flock && catalog.birdTypes.find((b) => b.id === flock.bird_type_id)?.lays_eggs)

/** "Layers" / "Broilers" for one flock. */
export const flockKind = (catalog: Pick<Catalog, 'birdTypes'>, flock: Pick<FlockRow, 'bird_type_id'> | undefined) => (flockLays(catalog, flock) ? 'Layers' : 'Broilers')

/**
 * Did the pen hold layers during the period? Decided by the flocks that were in it then, not the one in it
 * now, so a closed or replaced flock keeps its records under the right type.
 */
export function penLaysIn(catalog: Catalog, history: Pick<History, 'flocks'>, penId: number, r: { from: string; to: string }) {
  const then = history.flocks.filter((f) => f.pen_id === penId && f.placed_on <= r.to && (f.closed_on ?? '9999-12-31') >= r.from)
  return then.length ? then.some((f) => flockLays(catalog, f)) : penKind(catalog, penId) === 'Layers'
}

export const penKindIn = (catalog: Catalog, history: Pick<History, 'flocks'>, penId: number, r: { from: string; to: string }) =>
  penLaysIn(catalog, history, penId, r) ? 'Layers' : 'Broilers'

/** An alert as a dashboard row. */
export const alertRow = (a: FarmAlert): Alert => ({ id: a.id, kind: a.kind, tone: a.tone, title: a.title, detail: a.summary, time: a.time, to: a.link.to })

/** About `count` evenly spaced labels for a daily series, oldest to newest. */
export function dateLabels(dates: string[], count = 5) {
  if (dates.length <= count) return dates.map(formatDayMon)
  const step = (dates.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => formatDayMon(dates[Math.round(i * step)]))
}
