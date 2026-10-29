// Loads the farm's records from Supabase and turns them into the shapes the screens already use.
// Reference lists that screens import directly (products, pens, feed types, …) are filled in place,
// so those imports keep working; TradeProvider renders nothing until this has run.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/supabase/database.types'
import { displayPhone } from '../lib/phone'
import { customers as customerList, type Customer } from './customers'
import { pensToday, type PenToday } from './dashboard'
import type { Delivery, Order } from './deliveries'
import type { Expense, ExpenseCategory } from './expenses'
import { feedTypes, medications, type FeedType, type Medication, type Movement } from './inventory'
import type { Payment } from './payments'
import { pens as penList, type Pen } from './pens'
import type { ProductionRecord } from './production'
import type { Purchase, PurchaseKind } from './purchases'
import { products, type PaymentMethod, type Product, type ProductKind, type Sale } from './sales'
import { explain } from './explain'
import { farmSettings } from './farmSettings'
import { farmTodayISO, initialsOf, roleFromDb } from './session'
import { feedBands, staff, type StaffMember } from './settings'
import { suppliers as supplierList, type Supplier } from './suppliers'

type DB = SupabaseClient<Database>
type Tables = Database['public']['Tables']
type Row<T extends keyof Tables> = Tables[T]['Row']

/** Ids the store needs to turn screen actions back into database writes. */
export type Lookups = {
  saleId: Map<string, number>
  purchaseId: Map<string, number>
  activeFlockByPen: Map<number, number>
  feedTypeId: Map<string, number>
  medicationId: Map<string, number>
  categoryId: Map<string, number>
  reasonId: Map<string, number>
  medicationUnit: Map<string, string>
}

export type Remote = {
  sales: Sale[]
  purchases: Purchase[]
  payments: Payment[]
  customers: Customer[]
  suppliers: Supplier[]
  expenses: Expense[]
  orders: Order[]
  deliveries: Delivery[]
  productionRecords: ProductionRecord[]
  stock: Map<string, number>
  lookups: Lookups
  /** Raw rows and history for dashboards, reports and settings (see metrics.ts). */
  history: History
  catalog: Catalog
}

/** A day's production for one pen, with the calculated fields from the production_daily view. */
export type DailyRow = {
  id: number
  penId: number
  flockId: number
  date: string
  ageDays: number
  opening: number
  mortality: number
  closing: number
  mortalityPct: number | null
  feedTypeId: number | null
  feedBags: number
  feedKg: number
  expectedKg: number | null
  variancePct: number | null
  eggs: number | null
  cracked: number | null
  layingRate: number | null
  recordedBy: string
  createdAt: string
}

/** One item's stock for one day (stock_daily view). Eggs are counted in eggs, not crates. */
export type StockDay = {
  item: 'feed' | 'medication' | 'eggs' | 'cracked_eggs'
  feedTypeId: number | null
  medicationId: number | null
  date: string
  opening: number
  received: number
  used: number
  adjusted: number
  closing: number
}

/** A medication given in a daily entry. */
export type MedLine = {
  id: number
  date: string
  penId: number
  medicationId: number
  purchaseId: number | null
  quantity: number
  mode: string
  purpose: string
  recordedBy: string
}

export type History = {
  /** Oldest day loaded (YYYY-MM-DD). */
  since: string
  daily: DailyRow[]
  stockDays: StockDay[]
  medLines: MedLine[]
  adjustments: Row<'stock_adjustments'>[]
  /** Medication stock movements (per batch, per pen). */
  medMovements: Row<'stock_movements'>[]
  sales: Row<'sales'>[]
  /** Each sale's portions by pen (sale_allocations). */
  saleAllocations: Row<'sale_allocations'>[]
  purchases: Row<'purchases'>[]
  expenses: Row<'expenses'>[]
  payments: Row<'payments'>[]
  flocks: Row<'flocks'>[]
  /** Where each flock's birds came from (bird stock or not from a purchase), with cost a bird. */
  placements: Row<'flock_placements'>[]
}

export type Catalog = {
  settings: Row<'farm_settings'> | null
  /** Active pens. `bird_types` is the bird type of the flock in the pen now (null when empty). */
  pens: (Row<'pens'> & { bird_types: { name: string; lays_eggs: boolean } | null })[]
  /** Every pen, including inactive ones (Settings, Edit pen). */
  allPens: Row<'pens'>[]
  /** Received bird purchases and how many birds are still in stock. */
  birdStock: Database['public']['Views']['bird_stock']['Row'][]
  birdTypes: Row<'bird_types'>[]
  feedTypes: Row<'feed_types'>[]
  feedTargets: Row<'feed_targets'>[]
  medications: Row<'medications'>[]
  batches: { purchaseId: number; medicationId: number; batchNo: string | null; expiry: string | null; onHand: number }[]
  /** Stock on hand per item (stock_levels), including opening stock that isn't tied to a batch. */
  levels: { item: string; feedTypeId: number | null; medicationId: number | null; onHand: number }[]
  products: Row<'products'>[]
  categories: Row<'expense_categories'>[]
  reasons: Row<'adjustment_reasons'>[]
  profiles: Row<'profiles'>[]
  staffPens: Row<'staff_pens'>[]
  customers: Row<'customers'>[]
  suppliers: Row<'suppliers'>[]
}

// ── Formatting helpers ──────────────────────────────────────────────

const LAGOS = 'Africa/Lagos'
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const hm = (ts: string) => new Intl.DateTimeFormat('en-GB', { timeZone: LAGOS, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts))
const monthYear = (ts: string) => new Intl.DateTimeFormat('en-GB', { timeZone: LAGOS, month: 'short', year: 'numeric' }).format(new Date(ts))
const weekdayDm = (iso: string) => `${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))} ${dm(iso)}`
const first = (name: string | undefined) => (name ?? '—').split(' ')[0]
const daysAgo = (n: number) => new Date(Date.parse(farmTodayISO()) - n * 86_400_000).toISOString().slice(0, 10)
const method = (m: string | null): PaymentMethod | undefined => (m === 'pos' ? 'POS' : m === 'cash' || m === 'transfer' ? m : undefined)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Fill an imported array in place so every module that imported it sees the new rows. */
const fill = <T>(target: T[], rows: T[]) => void target.splice(0, target.length, ...rows)

const PRODUCT_KIND: Record<string, ProductKind> = { eggs: 'Eggs', birds: 'Birds', droppings: 'Droppings', sacks: 'Droppings' }
const UNIT_SHORT: Record<string, string> = { crate: 'cr', bird: 'birds', bag: 'bags', sack: 'sacks' }
const PURCHASE_KIND: Record<string, PurchaseKind> = { feed: 'Feed', birds: 'Birds', medication: 'Medication' }
const SUPPLIER_KIND: Record<string, Supplier['kind']> = { feed: 'Feed', birds: 'Birds', medication: 'Medication', equipment: 'Equipment' }

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
const PAGE = 1000

/** The API returns at most 1,000 rows a request, so read in pages until a short one comes back. Queries need a stable order. */
async function all<T>(q: { range: (from: number, to: number) => Page<T> }, what: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw new Error(`Couldn’t load ${what}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE) return out
  }
}

export async function loadRemote(db: DB): Promise<Remote> {
  // A year and a bit, so year-to-date reports work, and never less than the oldest flock still in a
  // pen, so its rearing cost is complete. Farm-scale volumes keep this small.
  // Also back to go-live, so the financial statements see every record since the opening balances.
  const [{ data: oldest }, { data: live }] = await Promise.all([
    db.from('flocks').select('placed_on').eq('status', 'active').order('placed_on').limit(1),
    db.from('farm_settings').select('go_live_date').limit(1),
  ])
  const since = [daysAgo(400), oldest?.[0]?.placed_on, live?.[0]?.go_live_date].filter((d): d is string => Boolean(d)).sort()[0]
  const recent = daysAgo(8)
  const [
    settingsRows, productRows, feedTypeRows, medicationRows, categoryRows, reasonRows, penRows, flockRows, staffPenRows, profileRows,
    customerRows, supplierRows, purchaseRows, saleRows, paymentRows, expenseRows, dailyRows, recordRows, medLineRows, levelRows, stockDayRows, batchRows,
    birdTypeRows, feedTargetRows, adjustmentRows, medMovementRows, allocationRows, placementRows, birdStockRows,
  ] = await Promise.all([
    all(db.from('farm_settings').select('*'), 'settings'),
    all(db.from('products').select('*').order('id'), 'products'),
    all(db.from('feed_types').select('*').order('id'), 'feed types'),
    all(db.from('medications').select('*').order('id'), 'medications'),
    all(db.from('expense_categories').select('*').order('id'), 'expense categories'),
    all(db.from('adjustment_reasons').select('*').order('id'), 'adjustment reasons'),
    all(db.from('pens').select('*').order('id'), 'pens'),
    all(db.from('flocks').select('*').order('placed_on'), 'flocks'),
    all(db.from('staff_pens').select('*'), 'pen assignments'),
    all(db.from('profiles').select('*'), 'staff'),
    all(db.from('customers').select('*').order('name'), 'customers'),
    all(db.from('suppliers').select('*').order('name'), 'suppliers'),
    all(db.from('purchases').select('*').is('deleted_at', null).order('purchased_on', { ascending: false }).order('id', { ascending: false }), 'purchases'),
    all(db.from('sales').select('*').is('deleted_at', null).neq('approval', 'rejected').order('sold_on', { ascending: false }).order('id', { ascending: false }), 'sales'),
    all(db.from('payments').select('*').is('deleted_at', null).order('paid_on', { ascending: false }).order('id', { ascending: false }), 'payments'),
    all(db.from('expenses').select('*').is('deleted_at', null).order('spent_on', { ascending: false }).order('id', { ascending: false }), 'expenses'),
    all(db.from('production_daily').select('*').gte('record_date', since).order('record_date', { ascending: false }).order('pen_id'), 'production'),
    all(db.from('production_records').select('id, pen_id, record_date, recorded_by, created_at').is('deleted_at', null).gte('record_date', since).order('id'), 'production entries'),
    all(db.from('production_medications').select('*, production_records!inner(record_date, pen_id, recorded_by, deleted_at)').gte('production_records.record_date', since).is('production_records.deleted_at', null).order('id'), 'medication given'),
    all(db.from('stock_levels').select('*'), 'stock levels'),
    all(db.from('stock_daily').select('*').gte('moved_on', since).order('moved_on', { ascending: false }).order('item').order('feed_type_id').order('medication_id'), 'stock ledger'),
    all(db.from('medication_batches').select('*').order('expiry_date'), 'medication batches'),
    all(db.from('bird_types').select('*').order('id'), 'bird types'),
    all(db.from('feed_targets').select('*').order('bird_type_id').order('week_from'), 'feed targets'),
    all(db.from('stock_adjustments').select('*').gte('adjusted_on', since).order('adjusted_on', { ascending: false }), 'stock adjustments'),
    all(db.from('stock_movements').select('*').eq('item', 'medication').gte('moved_on', since).order('moved_on', { ascending: false }).order('id'), 'medication movements'),
    all(db.from('sale_allocations').select('*').order('id'), 'sale portions'),
    all(db.from('flock_placements').select('*').order('id'), 'flock placements'),
    all(db.from('bird_stock').select('*').order('received_on', { ascending: false }).order('purchase_id'), 'bird stock'),
  ])
  const allFlockRows = flockRows
  // Most screens only care about the flock in each pen now.
  const activeFlocks = allFlockRows.filter((f) => f.status === 'active')
  // A pen's bird type is the type of the flock in it now; pens themselves only have a description.
  const allPenRows = penRows
  const birdTypeById = new Map(birdTypeRows.map((b) => [b.id, b]))
  const activePens = allPenRows
    .filter((p) => p.is_active)
    .map((p) => {
      const bird = birdTypeById.get(activeFlocks.find((f) => f.pen_id === p.id)?.bird_type_id ?? -1)
      return { ...p, bird_types: bird ? { name: bird.name, lays_eggs: bird.lays_eggs } : null }
    })

  const settings = settingsRows[0]
  if (settings) {
    Object.assign(farmSettings, {
      farmName: settings.farm_name,
      tradingAs: settings.trading_as,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      currency: settings.currency,
      timeZone: settings.time_zone,
      financialYearStartMonth: settings.financial_year_start_month,
      goLiveDate: settings.go_live_date,
      receiptFooter: settings.receipt_footer,
      whatsappSender: settings.whatsapp_sender,
      whatsappMonthlyLimit: settings.whatsapp_monthly_limit,
      mortalityAlertPct: Number(settings.mortality_alert_pct),
      feedVariancePct: Number(settings.feed_variance_pct),
      lowStockDays: settings.low_stock_days,
      expiryWarningDays: settings.expiry_warning_days,
      missingEntryCutoff: settings.missing_entry_cutoff.slice(0, 5),
      overdueDebtDays: settings.overdue_debt_days,
      eggsPerCrate: settings.eggs_per_crate,
      editWindowDays: settings.edit_window_days,
      spreadRearingCost: settings.spread_rearing_cost,
      layerLayingWeeks: settings.layer_laying_weeks,
    })
  }
  // Expected feed by age, used by the daily entry form.
  for (const [key, birdName] of [['Layers · Isa Brown', 'Layer'], ['Broilers · Ross 308', 'Broiler']] as const) {
    const bird = birdTypeRows.find((b) => b.name === birdName)
    const feed = new Map(feedTypeRows.map((f) => [f.id, f.name]))
    const bands = feedTargetRows.filter((t) => t.bird_type_id === bird?.id)
    if (bands.length) fill(feedBands[key], bands.map((t) => ({ from: t.week_from, to: t.week_to, grams: Number(t.grams_per_bird_day), feed: feed.get(t.recommended_feed_type_id ?? -1) ?? '—' })))
  }
  const variancePct = Number(settings?.feed_variance_pct ?? 10)
  const mortalityPct = Number(settings?.mortality_alert_pct ?? 0.5)
  const today = farmTodayISO()
  const profileName = new Map(profileRows.map((p) => [p.id, p.full_name]))
  const feedName = new Map(feedTypeRows.map((f) => [f.id, f.name]))
  const medName = new Map(medicationRows.map((m) => [m.id, m.name]))

  // ── Reference lists ──
  const lastPrice = new Map<number, number>()
  for (const s of saleRows) if (!lastPrice.has(s.product_id)) lastPrice.set(s.product_id, Number(s.unit_price))
  fill(
    products,
    productRows
      .filter((p) => p.is_active)
      .map<Product>((p) => ({
        id: String(p.id),
        kind: PRODUCT_KIND[p.kind],
        name: p.name,
        short: p.name.split(' · ')[0],
        unit: `${p.unit}s`,
        unitShort: UNIT_SHORT[p.unit] ?? `${p.unit}s`,
        from: p.stock_item === 'eggs' ? 'Egg store' : p.stock_item === 'cracked_eggs' ? 'Egg store · cracked' : 'Farm',
        minPrice: Number(p.min_price ?? 0),
        price: lastPrice.get(p.id) ?? Number(p.min_price ?? 0),
      })),
  )

  const stock = new Map<string, number>()
  for (const l of levelRows) {
    const name = l.item === 'feed' ? feedName.get(l.feed_type_id!) : l.item === 'medication' ? medName.get(l.medication_id!) : l.item
    if (name) stock.set(name, Number(l.on_hand ?? 0))
  }

  fill(
    feedTypes,
    feedTypeRows
      .filter((f) => f.is_active)
      .map<FeedType>((f) => {
        const days = stockDayRows.filter((d) => d.item === 'feed' && d.feed_type_id === f.id && d.moved_on! >= recent)
        const used = days.filter((d) => d.moved_on! >= daysAgo(7)).reduce((n, d) => n + Number(d.used ?? 0), 0)
        const bagsPerDay = used > 0 ? Math.round((used / 7) * 10) / 10 : null
        const bags = stock.get(f.name) ?? 0
        return {
          name: f.name,
          bags,
          daysOfCover: bagsPerDay ? Math.floor(bags / bagsPerDay) : null,
          reorderAt: Number(f.reorder_level_bags),
          bagsPerDay,
          note: bagsPerDay ? undefined : 'Not used in the last week',
          ledger: days.map<Movement>((d) => ({
            date: weekdayDm(d.moved_on!),
            received: Number(d.received) || undefined,
            used: Number(d.used) || undefined,
            adjust: Number(d.adjusted) || undefined,
            source: [Number(d.received) && 'Delivery', Number(d.used) && 'Pen entries', Number(d.adjusted) && 'Count or opening stock'].filter(Boolean).join(' · ') || '—',
          })),
        }
      }),
  )

  fill(
    medications,
    medicationRows
      .filter((m) => m.is_active)
      .map<Medication>((m) => {
        const batch = batchRows.find((b) => b.medication_id === m.id)
        return {
          name: m.name,
          category: cap(m.category),
          batch: batch?.batch_no ?? '—',
          expiry: batch?.expiry_date ? `${batch.expiry_date.slice(5, 7)}/${batch.expiry_date.slice(0, 4)}` : '—',
          stock: stock.get(m.name) ?? 0,
          reorderAt: Number(m.reorder_level),
          unit: (m.stock_unit === 'vial' ? 'vials' : m.stock_unit) as Medication['unit'],
          withdrawalDays: m.withdrawal_days,
        }
      }),
  )

  // ── Pens, flocks, today's entries ──
  const flockByPen = new Map(activeFlocks.map((f) => [f.pen_id, f]))
  const attendantsByPen = new Map<number, string[]>()
  for (const sp of staffPenRows) attendantsByPen.set(sp.pen_id, [...(attendantsByPen.get(sp.pen_id) ?? []), first(profileName.get(sp.profile_id))])
  const recordMeta = new Map(recordRows.map((r) => [r.id, r]))

  const penViews = activePens.map((p) => {
    const flock = flockByPen.get(p.id)
    const layers = p.bird_types?.lays_eggs ?? false
    const type: Pen['type'] = layers ? 'Layers' : 'Broilers'
    const rows = dailyRows.filter((d) => d.pen_id === p.id && d.flock_id === flock?.id && d.record_date! >= recent)
    const todayRow = rows.find((d) => d.record_date === today)
    const latest = rows[0]
    const ageDays = flock ? Math.round((Date.parse(today) - Date.parse(flock.placed_on)) / 86_400_000) + flock.age_at_placement_days : 0
    const week = Math.floor(ageDays / 7) + 1
    const birds = todayRow?.closing_birds ?? latest?.closing_birds ?? flock?.birds_placed ?? 0
    const meta = todayRow ? recordMeta.get(todayRow.id!) : undefined
    const time = meta ? hm(meta.created_at) : ''
    const spike = todayRow && Number(todayRow.mortality_pct ?? 0) > mortalityPct
    const off = todayRow && Math.abs(Number(todayRow.feed_variance_pct ?? 0)) > variancePct
    const status: Pen['status'] = !flock
      ? { tone: 'neutral', label: 'Empty' }
      : spike
        ? { tone: 'danger', label: 'Mortality alert' }
        : off
          ? { tone: 'warning', label: `Feed ${Number(todayRow!.feed_variance_pct) > 0 ? '+' : ''}${Number(todayRow!.feed_variance_pct).toFixed(0)}%` }
          : todayRow
            ? { tone: 'success', label: 'On track' }
            : { tone: 'neutral', label: `Due by ${farmSettings.missingEntryCutoff}` }
    const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : `${Number(v) > 0 ? '+' : Number(v) < 0 ? '−' : ''}${Math.abs(Number(v)).toFixed(1)}%`)
    const pen: Pen = {
      id: p.id,
      type,
      flock: flock?.code ?? '—',
      week,
      breed: flock?.breed ?? '—',
      liveBirds: flock ? birds : 0,
      capacity: p.capacity,
      status,
      attention: status.tone === 'danger' ? 1 : status.tone === 'warning' ? 2 : status.tone === 'neutral' ? 3 : 4,
      stats: [
        layers
          ? { label: 'Laying', value: todayRow?.laying_rate_pct === null || todayRow?.laying_rate_pct === undefined ? null : `${Number(todayRow.laying_rate_pct).toFixed(1)}%`, info: 'Eggs collected today ÷ hens at the start of the day.' }
          : { label: 'Age', value: flock ? `wk ${week}` : null, info: explain.flockWeek() },
        { label: 'Died today', value: todayRow ? String(todayRow.mortality) : null, tone: spike ? 'danger' : 'default', info: explain.diedToday() },
        { label: 'Feed vs exp.', value: pct(todayRow?.feed_variance_pct), tone: off ? 'warning' : 'default', info: explain.feedVsExpected() },
      ],
      footer: !flock ? 'No flock placed' : todayRow ? `Today recorded by ${first(profileName.get(meta?.recorded_by ?? ''))} · ${time}` : 'Not recorded yet today',
      staff: (attendantsByPen.get(p.id) ?? []).join(', ') || '—',
      ageDays,
    }
    const penToday: PenToday = {
      id: p.id,
      initials: `P${p.id}`,
      name: `${p.name} · ${type}`,
      flock: flock ? `${flock.code} · week ${week}` : 'No flock',
      birds: pen.liveBirds,
      died: todayRow ? todayRow.mortality : null,
      feedVsExpected: todayRow?.feed_variance_pct === null || todayRow?.feed_variance_pct === undefined ? null : Number(todayRow.feed_variance_pct),
      layingRate: todayRow?.laying_rate_pct === null || todayRow?.laying_rate_pct === undefined ? null : Number(todayRow.laying_rate_pct),
      entry: todayRow ? { tone: 'success', label: `Recorded ${time}` } : { tone: 'neutral', label: `Due by ${farmSettings.missingEntryCutoff}` },
    }
    return { pen, penToday, hasFlock: Boolean(flock) }
  })
  fill(penList, penViews.map((v) => v.pen))
  // Pen entry screens only list pens that have a flock to record.
  fill(pensToday, penViews.filter((v) => v.hasFlock).map((v) => v.penToday))

  const productionRecords: ProductionRecord[] = dailyRows
    .filter((d) => d.record_date === today)
    .map((d) => {
      const meta = recordMeta.get(d.id!)
      return {
        penId: d.pen_id!,
        date: d.record_date!,
        time: meta ? hm(meta.created_at) : '',
        opening: d.opening_birds!,
        died: d.mortality!,
        closing: d.closing_birds!,
        feedType: feedName.get(d.feed_type_id!) ?? '—',
        feedBags: Number(d.feed_bags),
        expectedKg: Number(d.expected_feed_kg ?? 0),
        feedVsExpected: Number(d.feed_variance_pct ?? 0),
        eggs: d.eggs_collected,
        cracked: d.eggs_cracked,
        layingRate: d.laying_rate_pct === null ? null : Number(d.laying_rate_pct),
        medications: medLineRows
          .filter((m) => m.production_record_id === d.id)
          .map((m) => ({ medication: medName.get(m.medication_id) ?? '—', qty: Number(m.quantity), mode: (m.mode === 'eye_nose_drop' ? 'Eye/nose drop' : cap(m.mode)) as ProductionRecord['medications'][number]['mode'], purpose: cap(m.purpose) as ProductionRecord['medications'][number]['purpose'] })),
        recordedBy: first(profileName.get(meta?.recorded_by ?? '')),
      }
    })

  // ── Staff ──
  const pensByProfile = new Map<string, number[]>()
  for (const sp of staffPenRows) pensByProfile.set(sp.profile_id, [...(pensByProfile.get(sp.profile_id) ?? []), sp.pen_id])
  fill(
    staff,
    profileRows.map<StaffMember>((p) => {
      const role = p.role_id ? roleFromDb(p.role_id) : 'pen-attendant'
      const ids = (pensByProfile.get(p.id) ?? []).sort((a, b) => a - b)
      return {
        id: p.id,
        name: p.full_name,
        initials: initialsOf(p.full_name),
        phone: p.phone ? displayPhone(p.phone.replace(/\D/g, '')) : '—',
        role,
        pens: ['owner', 'farm-manager', 'pen-attendant-all'].includes(role) ? 'All pens' : role === 'pen-attendant' ? (ids.length === 0 ? '—' : ids.length === 1 ? `Pen ${ids[0]}` : `Pens ${ids.join(', ')}`) : '—',
        lastActive: p.last_active_at ? `${dm(p.last_active_at.slice(0, 10))} ${hm(p.last_active_at)}` : '—',
        whatsapp: p.whatsapp_opt_in,
        active: p.is_active && Boolean(p.role_id),
      }
    }),
  )

  // ── Parties ──
  const lastSaleOn = new Map<number, string>()
  for (const s of saleRows) if (s.customer_id && !lastSaleOn.has(s.customer_id)) lastSaleOn.set(s.customer_id, s.sold_on)
  const customers = customerRows.map<Customer>((c) => ({
    id: String(c.id),
    name: c.name,
    short: c.short_name ?? c.name.split(' ').slice(0, 2).join(' '),
    initials: initialsOf(c.name),
    buys: c.buys.map(cap).join(', ') || '—',
    since: monthYear(c.created_at),
    area: c.area ?? '—',
    lastSale: lastSaleOn.has(c.id) ? dm(lastSaleOn.get(c.id)!) : '—',
    whatsapp: c.whatsapp_opt_in,
    opening: Number(c.opening_balance),
    openingSource: c.opening_balance_source ?? undefined,
    openingChecked: c.opening_balance_checked,
    olderSales: [],
  }))
  fill(customerList, customers)

  const lastPurchaseOn = new Map<number, string>()
  for (const p of purchaseRows) if (!lastPurchaseOn.has(p.supplier_id)) lastPurchaseOn.set(p.supplier_id, p.purchased_on)
  const lastPaymentOn = new Map<number, string>()
  for (const p of paymentRows) if (p.supplier_id && !lastPaymentOn.has(p.supplier_id)) lastPaymentOn.set(p.supplier_id, p.paid_on)
  const suppliers = supplierRows.map<Supplier>((s) => {
    const items = [...new Set(purchaseRows.filter((p) => p.supplier_id === s.id).map((p) => feedName.get(p.feed_type_id!) ?? medName.get(p.medication_id!) ?? 'Birds'))]
    return {
      id: String(s.id),
      name: s.name,
      short: s.short_name ?? s.name.split(' ')[0],
      initials: initialsOf(s.name),
      kind: SUPPLIER_KIND[s.supplies[0] ?? 'equipment'],
      supplies: items.slice(0, 3).join(', ') || s.supplies.map(cap).join(', ') || '—',
      since: monthYear(s.created_at),
      phone: s.phone ?? '—',
      termsDays: s.payment_terms_days ?? 0,
      lastPurchase: lastPurchaseOn.has(s.id) ? dm(lastPurchaseOn.get(s.id)!) : '—',
      lastPayment: lastPaymentOn.has(s.id) ? dm(lastPaymentOn.get(s.id)!) : '—',
      opening: Number(s.opening_balance),
      openingSource: s.opening_balance_source ?? undefined,
      openingChecked: s.opening_balance_checked,
    }
  })
  fill(supplierList, suppliers)

  // ── Transactions ──
  const portionsBySale = new Map<number, Row<'sale_allocations'>[]>()
  for (const a of allocationRows) portionsBySale.set(a.sale_id, [...(portionsBySale.get(a.sale_id) ?? []), a])
  const sales = saleRows.map<Sale>((s) => {
    const by = first(profileName.get(s.recorded_by))
    const history: Sale['history'] = [{ title: s.approval === 'pending' ? 'Sent for approval' : 'Sale recorded', detail: `By ${by}`, time: hm(s.created_at) }]
    if (s.approved_at) history.unshift({ title: `Approved by ${first(profileName.get(s.approved_by ?? ''))}`, detail: 'Receipt released', time: hm(s.approved_at) })
    return {
      receipt: s.ref,
      date: `${dm(s.sold_on)} ${hm(s.created_at)}`,
      iso: s.sold_on,
      customerId: s.customer_id ? String(s.customer_id) : 'one-off',
      productId: String(s.product_id),
      qty: Number(s.quantity),
      price: Number(s.unit_price),
      paid: Number(s.amount_paid),
      method: method(s.payment_method),
      recordedBy: by,
      pendingApproval: s.approval === 'pending',
      approvedAt: s.approved_at ? hm(s.approved_at) : undefined,
      allocations: (portionsBySale.get(s.id) ?? []).map((a) => ({ penId: a.pen_id, qty: Number(a.quantity) })),
      history,
    }
  })

  const itemName = (p: Row<'purchases'>) => (p.kind === 'feed' ? feedName.get(p.feed_type_id!) : p.kind === 'medication' ? medName.get(p.medication_id!) : p.notes) ?? 'Birds'
  const purchases = purchaseRows.map<Purchase>((p) => ({
    ref: p.ref,
    date: p.purchased_on,
    supplierId: String(p.supplier_id),
    kind: PURCHASE_KIND[p.kind],
    item: itemName(p),
    qty: Number(p.quantity),
    unit: p.unit,
    per: `a ${p.unit.replace(/s$/, '')}`,
    price: Number(p.unit_price),
    paidAtPurchase: Number(p.amount_paid),
    recordedBy: first(profileName.get(p.recorded_by)),
    received: p.received_on ? `Received ${dm(p.received_on)}` : undefined,
    history: [{ title: 'Purchase recorded', detail: `By ${first(profileName.get(p.recorded_by))}`, time: dm(p.purchased_on) }],
  }))

  const stockUnit = (p: Row<'purchases'>) => (p.kind === 'feed' ? 'bags' : (medicationRows.find((m) => m.id === p.medication_id)?.stock_unit ?? 'units'))
  const orderOf = (p: Row<'purchases'>): Order => ({
    ref: p.ref,
    supplierId: String(p.supplier_id),
    kind: p.kind === 'feed' ? 'feed' : 'medication',
    item: itemName(p),
    qty: Number(p.quantity),
    unit: p.unit,
    perUnit: Number(p.stock_units_per_unit),
    stockUnit: stockUnit(p),
    ordered: dm(p.purchased_on),
    orderedBy: first(profileName.get(p.recorded_by)),
  })
  const stockPurchases = purchaseRows.filter((p) => p.kind !== 'birds')
  const orders = stockPurchases.filter((p) => p.status === 'ordered').map(orderOf)
  const deliveries = stockPurchases
    .filter((p) => p.status === 'received')
    .slice(0, 20)
    .map<Delivery>((p) => {
      const { orderedBy: _ignored, ...o } = orderOf(p)
      return {
        ...o,
        qty: Number(p.received_quantity ?? p.quantity),
        received: `${dm(p.received_on!)}${p.updated_at ? ` ${hm(p.updated_at)}` : ''}`,
        by: first(profileName.get(p.received_by ?? p.recorded_by)),
        sentBack: Number(p.returned_quantity),
        note: p.delivery_note ?? '',
      }
    })

  const saleRefById = new Map(saleRows.map((s) => [s.id, s.ref]))
  const payments = paymentRows.map<Payment>((p) => ({
    ref: p.ref,
    date: p.paid_on,
    direction: p.direction,
    partyId: String(p.customer_id ?? p.supplier_id),
    method: method(p.method) ?? 'cash',
    reference: p.reference,
    amount: Number(p.amount),
    cleared: p.notes ?? '',
    saleRef: p.sale_id ? saleRefById.get(p.sale_id) : undefined,
    by: first(profileName.get(p.recorded_by)),
  }))

  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]))
  const expenses = expenseRows.map<Expense>((e) => ({
    id: e.ref,
    date: e.spent_on,
    category: (categoryName.get(e.category_id) ?? 'Other') as ExpenseCategory,
    description: e.description,
    pen: e.pen_id,
    supplierId: e.supplier_id ? String(e.supplier_id) : null,
    amount: Number(e.amount),
    amountPaid: Number(e.amount_paid),
    method: method(e.payment_method) ?? 'cash',
    receipt: Boolean(e.receipt_path),
    addedBy: first(profileName.get(e.recorded_by)),
  }))

  return {
    sales,
    purchases,
    payments,
    customers,
    suppliers,
    expenses,
    orders,
    deliveries,
    productionRecords,
    stock,
    lookups: {
      saleId: new Map(saleRows.map((s) => [s.ref, s.id])),
      purchaseId: new Map(purchaseRows.map((p) => [p.ref, p.id])),
      activeFlockByPen: new Map(activeFlocks.map((f) => [f.pen_id, f.id])),
      feedTypeId: new Map(feedTypeRows.map((f) => [f.name, f.id])),
      medicationId: new Map(medicationRows.map((m) => [m.name, m.id])),
      categoryId: new Map(categoryRows.map((c) => [c.name, c.id])),
      reasonId: new Map(reasonRows.map((r) => [r.name, r.id])),
      medicationUnit: new Map(medicationRows.map((m) => [m.name, m.stock_unit])),
    },
    history: {
      since,
      daily: dailyRows.map((d) => ({
        id: d.id!,
        penId: d.pen_id!,
        flockId: d.flock_id!,
        date: d.record_date!,
        ageDays: d.age_days ?? 0,
        opening: d.opening_birds ?? 0,
        mortality: d.mortality ?? 0,
        closing: d.closing_birds ?? 0,
        mortalityPct: d.mortality_pct === null ? null : Number(d.mortality_pct),
        feedTypeId: d.feed_type_id,
        feedBags: Number(d.feed_bags ?? 0),
        feedKg: Number(d.feed_kg ?? 0),
        expectedKg: d.expected_feed_kg === null ? null : Number(d.expected_feed_kg),
        variancePct: d.feed_variance_pct === null ? null : Number(d.feed_variance_pct),
        eggs: d.eggs_collected,
        cracked: d.eggs_cracked,
        layingRate: d.laying_rate_pct === null ? null : Number(d.laying_rate_pct),
        recordedBy: profileName.get(d.recorded_by ?? '') ?? '—',
        createdAt: d.created_at ?? '',
      })),
      stockDays: stockDayRows.map((d) => ({
        item: d.item!,
        feedTypeId: d.feed_type_id,
        medicationId: d.medication_id,
        date: d.moved_on!,
        opening: Number(d.opening ?? 0),
        received: Number(d.received ?? 0),
        used: Number(d.used ?? 0),
        adjusted: Number(d.adjusted ?? 0),
        closing: Number(d.closing ?? 0),
      })),
      medLines: medLineRows.map((m) => ({
        id: m.id,
        date: m.production_records.record_date,
        penId: m.production_records.pen_id,
        medicationId: m.medication_id,
        purchaseId: m.purchase_id,
        quantity: Number(m.quantity),
        mode: m.mode,
        purpose: m.purpose,
        recordedBy: profileName.get(m.production_records.recorded_by) ?? '—',
      })),
      adjustments: adjustmentRows,
      medMovements: medMovementRows,
      sales: saleRows,
      saleAllocations: allocationRows,
      purchases: purchaseRows,
      expenses: expenseRows,
      payments: paymentRows,
      flocks: allFlockRows,
      placements: placementRows,
    },
    catalog: {
      settings: settings ?? null,
      pens: activePens,
      allPens: allPenRows,
      birdStock: birdStockRows,
      birdTypes: birdTypeRows,
      feedTypes: feedTypeRows,
      feedTargets: feedTargetRows,
      medications: medicationRows,
      batches: batchRows.map((b) => ({ purchaseId: b.purchase_id!, medicationId: b.medication_id!, batchNo: b.batch_no, expiry: b.expiry_date, onHand: Number(b.on_hand ?? 0) })),
      levels: levelRows.map((l) => ({ item: l.item!, feedTypeId: l.feed_type_id, medicationId: l.medication_id, onHand: Number(l.on_hand ?? 0) })),
      products: productRows,
      categories: categoryRows,
      reasons: reasonRows,
      profiles: profileRows,
      staffPens: staffPenRows,
      customers: customerRows,
      suppliers: supplierRows,
    },
  }
}
