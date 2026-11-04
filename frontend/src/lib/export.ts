// Spreadsheet export. Builds a CSV in the browser and downloads it; the byte-order mark makes
// Excel read it as UTF-8 so ₦ and accented names come through.

/** One spreadsheet cell; null and undefined export as empty. */
export type Cell = string | number | boolean | null | undefined

// Quote only when needed, doubling inner quotes, as Excel expects.
const quote = (v: Cell) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The header and rows as CSV text, with Windows line endings. */
export function toCsv(header: string[], rows: Cell[][]) {
  return [header, ...rows].map((r) => r.map(quote).join(',')).join('\r\n')
}

/** Download rows as "<name>-<YYYY-MM-DD>.csv". */
export function downloadCsv(name: string, header: string[], rows: Cell[][]) {
  const blob = new Blob(['﻿' + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before freeing the file.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
