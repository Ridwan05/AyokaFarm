import type { AlertKind, AlertTone } from '../features/alerts/AlertRow'

// Alerts are calculated from the records (derivedAlerts.ts). Acknowledging or resolving one is
// shared with everyone through alert_marks (data/alertMarks.ts), keyed by the alert's id.

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

/** Shared status of an alert (alert_marks): who acknowledged or resolved it, and when. */
export type AlertMark = {
  status: 'acknowledged' | 'resolved'
  /** First name of whoever marked it. */
  by: string
  /** ISO timestamp */
  at: string
  note?: string
}
