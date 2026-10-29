const number = new Intl.NumberFormat('en-NG')

export const formatNumber = (n: number) => number.format(n)

/** "₦ 620,000" — the design puts a space after the sign in tables. */
export const formatNaira = (n: number) => `₦ ${number.format(n)}`

/** Signed percentage with a true minus sign: "+2.0%", "−4.0%". */
export const formatSignedPct = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`

/** "Friday, 09 October 2026" */
export function formatLongDate(d: Date) {
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const rest = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  return `${weekday}, ${rest}`
}

export function greeting(d: Date) {
  const h = d.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** "Thu 08 Oct" */
export function formatShortDate(d: Date) {
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const rest = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  return `${weekday} ${rest}`
}

/** Parse "2026-10-08" as a local date. */
export function parseISODate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Eggs as crates of 30 plus loose eggs: "26 cr + 20". */
export function formatCrates(eggs: number, perCrate = 30) {
  const crates = Math.floor(eggs / perCrate)
  const loose = eggs % perCrate
  return loose ? `${crates} cr + ${loose}` : `${crates} cr`
}

/** "Fri 09/10/2026" from a "09/10" day, in the current year unless given. */
export function formatDayMonth(dm: string, year = new Date().getFullYear()) {
  const [d, m] = dm.split('/').map(Number)
  const weekday = new Date(year, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' })
  return `${weekday} ${dm}/${year}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-03" → "03 Sep" (the browser's en-GB gives "Sept"). */
export const formatDayMon = (iso: string) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`
