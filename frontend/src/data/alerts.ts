import type { AlertKind, AlertTone } from '../features/alerts/AlertRow'

// Alerts are calculated from the records (derivedAlerts.ts). Acknowledging or resolving one is
// remembered on this device only (localStorage) — there is no alerts table.

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

/** What this device remembers about an alert. */
export type AlertMark = {
  status: 'acknowledged' | 'resolved'
  by: string
  /** ISO timestamp */
  at: string
  note?: string
  title: string
  where: string
  raised: string
}

const KEY = 'ayokafarm.alerts.v1'

export function readMarks(): Record<string, AlertMark> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, AlertMark>) : {}
  } catch {
    return {}
  }
}

export function writeMarks(marks: Record<string, AlertMark>) {
  try {
    // Forget marks older than 60 days so the list doesn't grow forever.
    const cutoff = Date.now() - 60 * 86_400_000
    const kept = Object.fromEntries(Object.entries(marks).filter(([, m]) => Date.parse(m.at) >= cutoff))
    localStorage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // Private windows or blocked storage: the mark lasts until the page reloads.
  }
}
