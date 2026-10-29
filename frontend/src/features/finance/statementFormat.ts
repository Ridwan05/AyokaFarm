import { naira } from '../../data/metrics'

/** ₦1,250,000 or (₦1,250,000) for negatives; "—" for nothing. */
export const money = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  const r = Math.round(n)
  if (r === 0) return '—'
  return r < 0 ? `(${naira(-r)})` : naira(r)
}
