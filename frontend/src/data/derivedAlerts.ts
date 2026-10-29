import type { FarmAlert } from './alerts'
import { farmSettings } from './farmSettings'
import { feedTypes } from './inventory'
import { addDays, ageBills, daysFrom, dayMonth, medicationOnHand, missingEntries, naira, num, penStaff, relativeDay, timeOf, todayISO, weekdayDayMonth } from './metrics'
import type { Trade } from './tradeContext'

// Alerts are calculated from the records each time (no alerts table): they appear when the
// condition is true and disappear when it clears. Acknowledging is kept per device (Alerts screen).

/** Managers who get every alert (BRD §7): the owner and farm manager. */
function managers(trade: Trade) {
  return trade.catalog.profiles
    .filter((p) => p.is_active && (p.role_id === 'owner' || p.role_id === 'farm_manager'))
    .map((p) => ({ name: p.full_name, channel: 'In the app', state: 'Shown here' }))
}

const penName = (trade: Trade, penId: number) => trade.catalog.pens.find((p) => p.id === penId)?.name ?? `Pen ${penId}`

export function deriveAlerts(trade: Trade, today = todayISO()): FarmAlert[] {
  const { history, catalog } = trade
  const out: FarmAlert[] = []
  const notify = managers(trade)
  const yesterday = addDays(today, -1)

  // Mortality and feed use: today's entries, or yesterday's for pens not recorded yet today.
  const latest = history.daily.filter((d) => d.date === today || d.date === yesterday)
  const seen = new Set<number>()
  for (const d of latest.sort((a, b) => b.date.localeCompare(a.date))) {
    if (seen.has(d.penId)) continue
    seen.add(d.penId)
    const pen = penName(trade, d.penId)
    const pct = d.mortalityPct ?? 0
    if (pct > farmSettings.mortalityAlertPct) {
      const last3 = history.daily
        .filter((x) => x.penId === d.penId && x.date <= d.date && x.date > addDays(d.date, -3))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((x) => x.mortality)
      const critical = pct >= farmSettings.mortalityAlertPct * 2
      out.push({
        id: `mortality-${d.penId}-${d.date}`,
        kind: 'mortality',
        tone: critical ? 'danger' : 'warning',
        severity: critical ? 'Critical' : 'Warning',
        status: 'new',
        pen: d.penId,
        title: `Mortality spike — ${pen}`,
        summary: `${num(d.mortality)} birds (${pct.toFixed(2)}%) · threshold ${farmSettings.mortalityAlertPct}%`,
        time: d.date === today ? timeOf(d.createdAt) : relativeDay(d.date, today),
        facts: [
          ['Died', `${num(d.mortality)} birds (${pct.toFixed(2)}%) · ${relativeDay(d.date, today)}`],
          ['Threshold', `${farmSettings.mortalityAlertPct}% ≈ ${num(Math.ceil((d.opening * farmSettings.mortalityAlertPct) / 100))} birds`],
          ['Last 3 days', last3.join(' · ')],
          ['Recorded by', `${d.recordedBy} · ${timeOf(d.createdAt)}`],
        ],
        notified: notify,
        link: { label: `Open ${pen}`, to: `/pens/${d.penId}` },
      })
    }
    if (d.variancePct !== null && Math.abs(d.variancePct) > farmSettings.feedVariancePct) {
      const over = d.variancePct > 0
      out.push({
        id: `feed-${d.penId}-${d.date}`,
        kind: 'feed',
        tone: 'warning',
        severity: 'Warning',
        status: 'new',
        pen: d.penId,
        title: `Feed ${Math.abs(d.variancePct).toFixed(0)}% ${over ? 'above' : 'below'} expected — ${pen}`,
        summary: `${num(d.feedKg)} kg vs ${num(d.expectedKg ?? 0)} kg`,
        time: relativeDay(d.date, today),
        facts: [
          ['Used', `${num(d.feedKg)} kg`],
          ['Expected', `${num(d.expectedKg ?? 0)} kg for ${num(d.opening)} birds`],
          ['Tolerance', `±${farmSettings.feedVariancePct}%`],
          ['Recorded by', `${d.recordedBy} · ${timeOf(d.createdAt)}`],
        ],
        notified: notify,
        link: { label: `Open ${pen}`, to: `/pens/${d.penId}` },
      })
    }
  }

  // Feed running low.
  for (const f of feedTypes) {
    const low = (f.daysOfCover !== null && f.daysOfCover <= farmSettings.lowStockDays) || f.bags <= f.reorderAt
    if (!low || (f.daysOfCover === null && f.bags > 0 && f.bagsPerDay === null && f.bags > f.reorderAt)) continue
    const critical = f.bags === 0 || (f.daysOfCover !== null && f.daysOfCover <= 2)
    out.push({
      id: `stock-feed-${f.name}`,
      kind: 'stock',
      tone: critical ? 'danger' : 'warning',
      severity: critical ? 'Critical' : 'Warning',
      status: 'new',
      title: f.daysOfCover !== null ? `${f.name} — ${f.daysOfCover} days of cover` : `${f.name} — below reorder level`,
      summary: `${num(f.bags)} bags · reorder level ${num(f.reorderAt)}`,
      time: 'Today',
      facts: [
        ['In store', `${num(f.bags)} bags`],
        ['Reorder level', `${num(f.reorderAt)} bags`],
        ['Average use', f.bagsPerDay !== null ? `${num(f.bagsPerDay, 1)} bags/day` : 'Not in use'],
        ['Days of cover', f.daysOfCover !== null ? `${f.daysOfCover} days` : '—'],
      ],
      notified: notify,
      link: { label: 'Open feed stock', to: '/inventory/feed' },
    })
  }

  // Medication: below reorder level, and batches close to expiry.
  const onHand = medicationOnHand(catalog)
  for (const m of catalog.medications.filter((x) => x.is_active)) {
    const have = onHand.get(m.id) ?? 0
    if (m.reorder_level > 0 && have <= m.reorder_level) {
      out.push({
        id: `stock-med-${m.id}`,
        kind: 'stock',
        tone: have === 0 ? 'danger' : 'warning',
        severity: have === 0 ? 'Critical' : 'Warning',
        status: 'new',
        title: `${m.name} — ${have === 0 ? 'out of stock' : 'below reorder level'}`,
        summary: `${num(have)} ${m.stock_unit} · reorder level ${num(m.reorder_level)}`,
        time: 'Today',
        facts: [
          ['In store', `${num(have)} ${m.stock_unit}`],
          ['Reorder level', `${num(m.reorder_level)} ${m.stock_unit}`],
        ],
        notified: notify,
        link: { label: 'Open medication stock', to: '/inventory/medication' },
      })
    }
  }
  for (const b of catalog.batches.filter((x) => x.expiry && x.onHand > 0)) {
    const left = daysFrom(today, b.expiry!)
    if (left > farmSettings.expiryWarningDays) continue
    const m = catalog.medications.find((x) => x.id === b.medicationId)
    out.push({
      id: `expiry-${b.purchaseId}`,
      kind: 'stock',
      tone: left <= 0 ? 'danger' : 'warning',
      severity: left <= 0 ? 'Critical' : 'Warning',
      status: 'new',
      title: left <= 0 ? `${m?.name} batch ${b.batchNo ?? ''} has expired` : `${m?.name} expiring in ${left} days`,
      summary: `Batch ${b.batchNo ?? '—'} · ${num(b.onHand)} ${m?.stock_unit ?? ''} left`,
      time: 'Today',
      facts: [
        ['Batch', b.batchNo ?? '—'],
        ['Expires', dayMonth(b.expiry!) + ' ' + b.expiry!.slice(0, 4)],
        ['On hand', `${num(b.onHand)} ${m?.stock_unit ?? ''}`],
        ['Warning window', `${farmSettings.expiryWarningDays} days`],
      ],
      notified: notify,
      link: { label: 'Open medication stock', to: '/inventory/medication' },
    })
  }

  // Missing daily entries.
  for (const e of missingEntries(history, today)) {
    const pen = penName(trade, e.penId)
    const who = penStaff(catalog, e.penId)
    out.push({
      id: `missing-${e.penId}-${e.date}`,
      kind: 'missing-entry',
      tone: e.late ? 'warning' : 'info',
      severity: e.late ? 'Warning' : 'Info',
      status: 'new',
      pen: e.penId,
      title: `${pen} — ${e.late ? 'yesterday’s' : 'today’s'} entry missing`,
      summary: e.late ? 'Not recorded — check with the pen attendant' : `Due by ${farmSettings.missingEntryCutoff}`,
      time: e.late ? 'Yesterday' : farmSettings.missingEntryCutoff,
      facts: [
        ['Missing day', weekdayDayMonth(e.date)],
        ['Assigned to', who.join(', ') || 'Nobody assigned'],
      ],
      notified: [...notify, ...who.map((name) => ({ name, channel: 'In the app', state: 'Shown on their home' }))],
      link: { label: `Open ${pen}`, to: `/pens/${e.penId}` },
    })
  }

  // Customer debts past the overdue limit.
  for (const c of trade.customers) {
    const bills = trade.customerOpenBills(c.id)
    const overdue = ageBills(bills, today).find((b) => b.overdue)?.amount ?? 0
    if (overdue <= 0) continue
    const total = bills.reduce((n, b) => n + b.left, 0)
    const lastPaid = trade.payments.filter((p) => p.direction === 'in' && p.partyId === c.id).sort((a, b) => b.date.localeCompare(a.date))[0]
    out.push({
      id: `debt-${c.id}`,
      kind: 'debt',
      tone: 'danger',
      severity: 'Critical',
      status: 'new',
      title: `Debt over ${farmSettings.overdueDebtDays} days — ${c.name}`,
      summary: `${naira(overdue)} · total owed ${naira(total)}`,
      time: 'Today',
      facts: [
        [`Over ${farmSettings.overdueDebtDays} days`, naira(overdue)],
        ['Total owed', naira(total)],
        ['Last payment', lastPaid ? dayMonth(lastPaid.date) : 'None yet'],
      ],
      notified: notify.filter((n) => catalog.profiles.some((p) => p.full_name === n.name && p.role_id === 'owner')),
      link: { label: 'Open statement', to: `/customers/${c.id}` },
    })
  }

  const rank = { Critical: 0, Warning: 1, Info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}
