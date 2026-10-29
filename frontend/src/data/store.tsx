'use client'

import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { createClient } from '../lib/supabase/client'
import { allocate, customerBills, customerStatement, describeAllocation, sumLeft, supplierBalance, supplierBills, supplierCharged, supplierStatement } from './ledger'
import { loadRemote, type Remote } from './remote'
import type { TablesInsert } from '../lib/supabase/database.types'
import { amountOf, type PaymentMethod } from './sales'
import { farmTodayISO } from './session'
import { Splash } from './SessionProvider'
import { useCurrentUser } from './sessionContext'
import type { ProductionRecord } from './production'
import { TradeContext, type BirdSource, type Trade } from './tradeContext'

// The farm's records, loaded from Supabase. Screens read and write through useTrade(); every write
// goes to the database (where triggers calculate refs, stock, bird counts and approvals) and then
// the records are reloaded. Row-level security decides what each person can see and change.

const toSources = (sources: BirdSource[]) => sources.map((x) => ({ purchase_id: x.purchaseId, birds: x.birds, cost_per_bird: x.costPerBird ?? null }))

const dbMethod = (m: PaymentMethod | undefined) => (m === 'POS' ? 'pos' : m) ?? null

const RECEIPTS = 'receipts'
const receiptError = (message: string) =>
  /bucket not found/i.test(message) ? 'receipt storage isn’t set up yet (run the latest database migration).' : friendly(message)

/**
 * A refused update (row-level security) changes no rows and returns no error, so check that a row
 * came back and turn "nothing changed" into a message.
 */
async function changed(
  q: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  refusal = 'You can’t change this record any more — ask the farm manager or owner.',
): Promise<{ error: { message: string } | null }> {
  const res = await q
  if (res.error) return { error: res.error }
  return res.data?.length ? { error: null } : { error: { message: refusal } }
}

/** Turn a Postgres/PostgREST error into a sentence for a toast. */
function friendly(message: string) {
  if (/row-level security|permission denied|42501/i.test(message)) return 'You don’t have permission to do that.'
  if (/duplicate key.*production_one_per_pen_day/i.test(message)) return 'This pen already has an entry for today.'
  return message.replace(/^.*?ERROR:\s*/, '')
}

export function TradeProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  const db = useMemo(() => createClient(), [])
  const [data, setData] = useState<Remote | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await loadRemote(db))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [db])

  useEffect(() => {
    // Initial load from Supabase (an external system), so setting state here is intended.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  if (loadError && !data) {
    return (
      <Splash>
        <span className="type-h3 text-fg-primary">Couldn’t load the farm’s records</span>
        <span className="max-w-[420px] text-center">{loadError}</span>
        <Button leadingIcon={RefreshCw} onClick={() => void reload()}>
          Try again
        </Button>
      </Splash>
    )
  }
  if (!data) return <Splash>Loading the farm’s records…</Splash>

  const { sales, purchases, payments, customers, suppliers, lookups } = data
  const today = farmTodayISO()

  /** Run a write, show a toast if it fails, then reload. Resolves true when it saved. */
  async function write(run: () => PromiseLike<{ error: { message: string } | null }>): Promise<boolean> {
    const { error } = await run()
    if (error) {
      toast.error(friendly(error.message))
      return false
    }
    await reload()
    return true
  }

  const books = { purchases, expenses: data.expenses, payments }
  function withSupplier<T>(id: string, run: (s: (typeof suppliers)[number]) => T, none: T): T {
    const s = suppliers.find((x) => x.id === id)
    return s ? run(s) : none
  }

  /** The database id behind a money record's reference (receipt or ref). */
  function recordId(kind: 'sales' | 'purchases' | 'payments' | 'expenses', ref: string) {
    const rows: { id: number; ref: string }[] = data!.history[kind]
    const id = rows.find((r) => r.ref === ref)?.id
    if (!id) toast.error(`${ref} wasn’t found — reload and try again.`)
    return id
  }

  /** Upload a receipt and point the expense at it. Upload trouble is reported but the expense stays saved. */
  async function attachReceipt(expenseId: number, ref: string, file: File) {
    const path = `${ref}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
    const { error: upError } = await db.storage.from(RECEIPTS).upload(path, file, { contentType: file.type || undefined })
    if (upError) {
      toast.error(`${ref} is saved, but the receipt didn’t upload: ${receiptError(upError.message)}`)
      return
    }
    const { error } = await db.from('expenses').update({ receipt_path: path }).eq('id', expenseId)
    if (error) toast.error(`${ref} is saved, but the receipt wasn’t linked: ${friendly(error.message)}`)
  }

  /** What's still owed on one sale after its own payment and any payments since. */
  function saleLeft(receipt: string) {
    const sale = sales.find((s) => s.receipt === receipt)
    if (!sale) return 0
    if (sale.pendingApproval || sale.customerId === 'one-off') return Math.max(0, amountOf(sale) - sale.paid)
    return customerOpenBills(sale.customerId).find((b) => b.ref === receipt)?.left ?? 0
  }

  const entryPayload = (r: ProductionRecord, flock: number | null) => ({
    pen_id: r.penId,
    flock_id: flock,
    record_date: r.date,
    mortality: r.died,
    feed_type_id: r.feedBags > 0 ? (lookups.feedTypeId.get(r.feedType) ?? null) : null,
    feed_bags: r.feedBags,
    eggs_collected: r.eggs,
    eggs_cracked: r.cracked,
    notes: r.notes ?? null,
  })
  const medicationPayload = (r: ProductionRecord) =>
    r.medications.map((m) => ({
      medication_id: lookups.medicationId.get(m.medication)!,
      quantity: m.qty,
      mode: m.mode === 'Eye/nose drop' ? 'eye_nose_drop' : m.mode.toLowerCase(),
      purpose: m.purpose.toLowerCase(),
    }))

  const customerOpenBills = (id: string) => {
    const c = customers.find((x) => x.id === id)
    return c ? customerBills(c, sales, payments) : []
  }

  const value: Trade = {
    sales,
    purchases,
    payments,
    customers,
    suppliers,
    customerOpenBills,
    customerBalance: (id) => sumLeft(customerOpenBills(id)),
    customerStatement: (id) => {
      const c = customers.find((x) => x.id === id)
      return c ? customerStatement(c, sales, payments) : []
    },
    orders: data.orders,
    deliveries: data.deliveries,
    // Today's ledger rows come from Supabase with the rest; nothing is held only in the browser.
    stockMoves: [],
    stockOf: (item) => data.stock.get(item) ?? 0,
    expenses: data.expenses,
    productionRecords: data.productionRecords,
    supplierBalance: (id) => withSupplier(id, (s) => supplierBalance(s, books), 0),
    supplierOpenBills: (id) => withSupplier(id, (s) => supplierBills(s, books), []),
    supplierStatement: (id) => withSupplier(id, (s) => supplierStatement(s, books), []),
    purchasePaid: (ref) => {
      const p = purchases.find((x) => x.ref === ref)
      return p ? withSupplier(p.supplierId, (s) => supplierCharged(s, books).find((x) => x.ref === ref)?.paid ?? 0, 0) : 0
    },
    settings: data.catalog.settings,
    history: data.history,
    catalog: data.catalog,
    reload,

    receiveDelivery: (ref, delivered, sentBack, note, _by, batch) =>
      write(() =>
        db
          .from('purchases')
          .update({
            status: 'received',
            received_on: today,
            received_quantity: delivered,
            returned_quantity: sentBack,
            delivery_note: note || null,
            ...(batch ? { batch_no: batch.batchNo || null, expiry_date: batch.expiry || null } : {}),
          })
          .eq('id', lookups.purchaseId.get(ref)!),
      ),

    decideCount: (adjustmentId, approve) =>
      write(() => db.from('stock_adjustments').update({ status: approve ? 'applied' : 'rejected' }).eq('id', adjustmentId)),

    addStockMoves: (moves) =>
      write(() =>
        db.from('stock_adjustments').insert(
          moves.map((m) => {
            const feed = lookups.feedTypeId.get(m.item)
            const med = lookups.medicationId.get(m.item)
            return {
              item: feed ? ('feed' as const) : med ? ('medication' as const) : (m.stockItem ?? ('eggs' as const)),
              feed_type_id: feed ?? null,
              medication_id: med ?? null,
              quantity_change: m.qty,
              counted_quantity: m.counted ?? null,
              reason_id: lookups.reasonId.get(m.reason ?? 'Recount') ?? lookups.reasonId.get('Recount')!,
              note: m.source,
              status: m.pending ? 'pending' : 'applied',
              recorded_by: user.id,
            }
          }),
        ),
      ),

    async addExpense(e, receipt) {
      const { data: saved, error } = await db
        .from('expenses')
        .insert({
          spent_on: e.date,
          category_id: lookups.categoryId.get(e.category) ?? lookups.categoryId.get('Other')!,
          description: e.description,
          amount: e.amount,
          supplier_id: e.supplierId ? Number(e.supplierId) : null,
          // Anything not paid now is owed to the supplier (FR-SUP-3).
          amount_paid: e.amountPaid ?? e.amount,
          payment_method: dbMethod(e.method),
          pen_id: e.pen,
          receipt_path: null,
          recorded_by: user.id,
        } as TablesInsert<'expenses'>)
        .select('id, ref')
        .single()
      if (error || !saved) {
        toast.error(friendly(error?.message ?? 'The expense wasn’t saved'))
        return false
      }
      if (receipt) await attachReceipt(saved.id, saved.ref, receipt)
      await reload()
      return true
    },

    receiptUrl: async (path) => {
      const { data: link, error } = await db.storage.from(RECEIPTS).createSignedUrl(path, 600)
      if (error) toast.error(receiptError(error.message))
      return link?.signedUrl ?? null
    },

    voidRecord: (kind, ref, reason) => {
      const id = recordId(kind, ref)
      if (!id) return Promise.resolve(false)
      const voided = { deleted_at: new Date().toISOString(), delete_reason: reason.trim() }
      const query =
        kind === 'sales'
          ? db.from('sales').update(voided).eq('id', id).select('id')
          : kind === 'purchases'
            ? db.from('purchases').update(voided).eq('id', id).select('id')
            : kind === 'payments'
              ? db.from('payments').update(voided).eq('id', id).select('id')
              : db.from('expenses').update(voided).eq('id', id).select('id')
      return write(() => changed(query, 'Only the owner can void a record.'))
    },

    updateSale: (receipt, patch) => {
      const id = recordId('sales', receipt)
      return id ? write(() => changed(db.from('sales').update(patch).eq('id', id).select('id'))) : Promise.resolve(false)
    },
    updatePurchase: (ref, patch) => {
      const id = recordId('purchases', ref)
      return id ? write(() => changed(db.from('purchases').update(patch).eq('id', id).select('id'))) : Promise.resolve(false)
    },
    updatePayment: (ref, patch) => {
      const id = recordId('payments', ref)
      return id ? write(() => changed(db.from('payments').update(patch).eq('id', id).select('id'))) : Promise.resolve(false)
    },
    async updateExpense(ref, patch, receipt) {
      const id = recordId('expenses', ref)
      if (!id) return false
      const res = await changed(db.from('expenses').update(patch).eq('id', id).select('id'))
      if (res.error) {
        toast.error(friendly(res.error.message))
        return false
      }
      if (receipt) await attachReceipt(id, ref, receipt)
      await reload()
      return true
    },

    async addProductionRecord(r) {
      const flock = lookups.activeFlockByPen.get(r.penId)
      if (!flock) {
        toast.error(`Pen ${r.penId} has no flock to record`)
        return false
      }
      // The entry and its medication lines are saved together, so a dose can't go missing.
      return write(() => db.rpc('save_daily_entry', { entry: entryPayload(r, flock), medications: medicationPayload(r) }))
    },

    updateProductionRecord: (recordId, r) =>
      write(() => db.rpc('save_daily_entry', { entry: entryPayload(r, null), medications: medicationPayload(r), entry_id: recordId })),

    deleteProductionRecord: (recordId, reason) =>
      write(async () => {
        const res = await db.from('production_records').update({ deleted_at: new Date().toISOString(), delete_reason: reason }).eq('id', recordId).select('id')
        // A refused update changes no rows and returns no error; say so.
        return !res.error && !res.data?.length ? { error: { message: 'permission denied: only the owner can delete an entry' } } : res
      }),

    addCustomer: (c) =>
      write(() =>
        db.from('customers').insert({
          name: c.name,
          short_name: c.short,
          area: c.area === '—' ? null : c.area,
          buys: c.buys
            .split(/,\s*/)
            .map((b) => b.toLowerCase())
            .filter((b): b is 'eggs' | 'birds' | 'droppings' | 'sacks' => ['eggs', 'birds', 'droppings', 'sacks'].includes(b)),
          whatsapp_opt_in: c.whatsapp,
          opening_balance: c.opening,
          created_by: user.id,
        }),
      ),

    addSupplier: (s) =>
      write(() =>
        db.from('suppliers').insert({
          name: s.name,
          short_name: s.short,
          phone: s.phone === '—' ? null : s.phone,
          supplies: [s.kind.toLowerCase() as 'feed'],
          payment_terms_days: s.termsDays,
          created_by: user.id,
        }),
      ),

    approveSale: (receipt) => write(() => db.from('sales').update({ approval: 'approved' }).eq('id', lookups.saleId.get(receipt)!)),
    rejectSale: (receipt) => write(() => db.from('sales').update({ approval: 'rejected' }).eq('id', lookups.saleId.get(receipt)!)),

    addSale: (s) =>
      write(() =>
        // One call so the sale and its pen portions are saved together (and checked by the database).
        db.rpc('record_sale', {
          sale: {
            sold_on: today,
            customer_id: s.customerId === 'one-off' ? null : Number(s.customerId),
            buyer_name: s.customerId === 'one-off' ? 'Walk-in buyer' : null,
            product_id: Number(s.productId),
            quantity: s.qty,
            unit_price: s.price,
            amount_paid: s.paid,
            payment_method: dbMethod(s.method),
          },
          portions: (s.allocations ?? []).map((a) => ({ pen_id: a.penId, quantity: a.qty })),
        }),
      ),

    setSaleAllocations: (receipt, portions) =>
      write(() =>
        db.rpc('set_sale_allocations', {
          sale_id: lookups.saleId.get(receipt)!,
          portions: portions.map((a) => ({ pen_id: a.penId, quantity: a.qty })),
        }),
      ),

    // A payment row for that sale (money in, dated today) rather than an edit of the sale: the edit
    // window would refuse that, and the cash would be dated on the day of the sale.
    recordSalePayment(receipt, amount, m) {
      const sale = sales.find((s) => s.receipt === receipt)
      if (!sale || sale.customerId === 'one-off') {
        toast.error('One-off buyers pay in full at the sale.')
        return Promise.resolve(false)
      }
      return write(() =>
        db.from('payments').insert({
          paid_on: today,
          direction: 'in',
          customer_id: Number(sale.customerId),
          sale_id: lookups.saleId.get(receipt)!,
          amount,
          method: dbMethod(m) ?? 'cash',
          notes: `${receipt} ${amount >= saleLeft(receipt) ? 'in full' : 'part'}`,
          recorded_by: user.id,
          // ref (P-0001) is set by a database trigger.
        } as TablesInsert<'payments'>),
      )
    },

    saleLeft,

    addPurchase(p) {
      const kind = p.kind === 'Feed' ? 'feed' : p.kind === 'Birds' ? 'birds' : 'medication'
      return write(() =>
        db.from('purchases').insert({
          kind,
          purchased_on: p.date,
          supplier_id: Number(p.supplierId),
          feed_type_id: kind === 'feed' ? lookups.feedTypeId.get(p.item)! : null,
          medication_id: kind === 'medication' ? lookups.medicationId.get(p.item)! : null,
          quantity: p.qty,
          unit: p.unit,
          unit_price: p.price,
          amount_paid: p.paidAtPurchase,
          payment_method: p.paidAtPurchase > 0 ? dbMethod(p.method) : null,
          stock_units_per_unit: p.unitsPerUnit ?? 1,
          // Feed and medication wait for the Store Keeper to receive them; birds arrive with the flock.
          status: kind === 'birds' ? 'received' : 'ordered',
          received_on: kind === 'birds' ? p.date : null,
          notes: kind === 'birds' ? p.item : null,
          bird_type_id: kind === 'birds' ? (p.bird?.birdTypeId ?? null) : null,
          breed: kind === 'birds' ? (p.bird?.breed ?? null) : null,
          bird_age_days: kind === 'birds' ? (p.bird?.ageDays ?? 0) : 0,
          recorded_by: user.id,
          // ref (PF-/PB-/PM-0001) is set by a database trigger.
        } as TablesInsert<'purchases'>),
      )
    },

    async recordPayment(p) {
      const bills = p.direction === 'in' ? customerOpenBills(p.partyId) : withSupplier(p.partyId, (s) => supplierBills(s, books), [])
      const cleared = describeAllocation(allocate(bills, p.amount)) || 'Held as credit'
      const saved = await write(() =>
        db.from('payments').insert({
          paid_on: p.date,
          direction: p.direction,
          customer_id: p.direction === 'in' ? Number(p.partyId) : null,
          supplier_id: p.direction === 'out' ? Number(p.partyId) : null,
          amount: p.amount,
          method: dbMethod(p.method) ?? 'cash',
          reference: p.reference,
          notes: cleared,
          recorded_by: user.id,
          // ref (P-/PP-0001) is set by a database trigger.
        } as TablesInsert<'payments'>),
      )
      return saved ? cleared : null
    },

    addPen: (pen) => write(() => db.from('pens').insert({ name: pen.name, capacity: pen.capacity, description: pen.description || null })),

    updatePen: (penId, patch) => write(() => db.from('pens').update(patch).eq('id', penId)),

    updateFlock: (flockId, patch) => write(() => db.from('flocks').update(patch).eq('id', flockId)),

    setFlockSources: (flockId, sources) => write(() => db.rpc('set_flock_sources', { flock_id: flockId, sources: toSources(sources) })),

    addBirdsToFlock: (flockId, placedOn, sources) =>
      write(() => db.rpc('add_birds_to_flock', { flock_id: flockId, placed_on: placedOn, sources: toSources(sources) })),

    placeFlock: (f) =>
      write(() =>
        db.rpc('place_flock', {
          flock: {
            code: f.code,
            pen_id: f.penId,
            bird_type_id: f.birdTypeId,
            breed: f.breed || null,
            placed_on: f.placedOn,
            age_at_placement_days: f.ageAtPlacementDays,
            notes: f.notes || null,
          },
          sources: toSources(f.sources),
        }),
      ),
  }

  return <TradeContext.Provider value={value}>{children}</TradeContext.Provider>
}
