// Spreadsheet export. Builds a CSV in the browser and downloads it; the byte-order mark makes
// Excel read it as UTF-8 so ₦ and accented names come through.

export type Cell = string | number | boolean | null | undefined

const quote = (v: Cell) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

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
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
