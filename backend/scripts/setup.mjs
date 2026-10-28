#!/usr/bin/env node
// Creates the Owner account and, with --demo, loads a demo farm.
//
//   node backend/scripts/setup.mjs           # create the Owner only
//   node backend/scripts/setup.mjs --demo    # Owner + demo staff, pens, flocks, customers, records
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from frontend/.env.local.
// The secret key bypasses row-level security, so run this only on your own machine.

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'

const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

// ── Config ──────────────────────────────────────────────────────────

const envFile = new URL('../../frontend/.env.local', import.meta.url)
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in frontend/.env.local first.')
  process.exit(1)
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Same rules as frontend/src/lib/phone.ts.
const LOGIN_DOMAIN = 'phone.ayokafarm.app'
function normalisePhone(input) {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('0') && d.length === 11) d = '234' + d.slice(1)
  if (d.length === 10 && !d.startsWith('0')) d = '234' + d
  return /^234[789]\d{9}$/.test(d) ? d : null
}
const loginEmail = (phone) => `${phone}@${LOGIN_DOMAIN}`

// ── Prompts ─────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((resolve) => rl.question(q, resolve))
/** Asks without echoing what's typed. */
function askHidden(q) {
  return new Promise((resolve) => {
    const write = rl._writeToOutput
    rl._writeToOutput = (s) => (s.includes(q) ? write.call(rl, s) : write.call(rl, '*'.repeat(s.length ? 1 : 0)))
    rl.question(q, (answer) => {
      rl._writeToOutput = write
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

/** Multi-row inserts: columns a row leaves out take their default rather than null. */
const OPTS = { defaultToNull: false }

function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  return result.data
}

/**
 * Creates a sign-in account. The new-user trigger makes its profile; the role is then set here, because
 * Supabase writes app_metadata just after the insert the trigger sees.
 */
async function createAccount({ name, phone, password, role, demo = false }) {
  const { data, error } = await db.auth.admin.createUser({
    email: loginEmail(phone),
    password,
    email_confirm: true,
    app_metadata: { role, demo },
    user_metadata: { full_name: name },
  })
  if (error) throw new Error(`Creating ${name}: ${error.message}`)
  check(await db.from('profiles').update({ role_id: role, phone: `+${phone}`, whatsapp_opt_in: true }).eq('id', data.user.id), `Saving ${name}'s profile`)
  return data.user.id
}

// ── Owner ───────────────────────────────────────────────────────────

async function setupOwner() {
  const { data: existing } = await db.from('profiles').select('id, full_name').eq('role_id', 'owner').limit(1)
  if (existing?.length) {
    console.log(`An Owner account already exists (${existing[0].full_name}). Skipping.`)
    return existing[0].id
  }
  // An owner account whose role didn't stick (created before this fix): repair it.
  const { data: users } = await db.auth.admin.listUsers()
  const owner = users?.users.find((u) => u.app_metadata?.role === 'owner')
  if (owner) {
    check(await db.from('profiles').update({ role_id: 'owner' }).eq('id', owner.id), 'Repairing the owner role')
    console.log('✓ Owner role restored on the existing account.')
    return owner.id
  }
  console.log('\nCreate the Owner account — the only account that can add other staff.')
  const name = (await ask('Owner full name: ')).trim()
  const phone = normalisePhone(await ask('Owner phone number (their sign-in): '))
  if (!name || !phone) throw new Error('Enter a name and a Nigerian mobile number.')
  const password = await askHidden('Choose a password (8+ characters): ')
  if (password.length < 8) throw new Error('The password needs at least 8 characters.')
  if ((await askHidden('Type it again: ')) !== password) throw new Error('The passwords didn’t match.')
  const id = await createAccount({ name, phone, password, role: 'owner' })
  console.log(`✓ Owner created: ${name}. Sign in with ${'0' + phone.slice(3)} and your password.`)
  return id
}

// ── Demo farm ───────────────────────────────────────────────────────

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const daysAgo = (n) => new Date(Date.parse(today) - n * 86_400_000).toISOString().slice(0, 10)
const ids = async (table, key = 'name') => new Map(check(await db.from(table).select(`id, ${key}`), table).map((r) => [r[key], r.id]))

async function setupDemo(ownerId) {
  const { count } = await db.from('production_records').select('id', { count: 'exact', head: true })
  if (count) {
    console.log('The demo farm is already loaded. Run remove-demo.mjs first to start over.')
    return
  }
  // A run that stopped part-way left some rows behind; reuse them rather than duplicate them.
  const existing = async (table, key) => new Map(check(await db.from(table).select(`id, ${key}`), table).map((r) => [r[key], r.id]))
  const { data: userList } = await db.auth.admin.listUsers({ perPage: 1000 })
  const demoPassword = `demo-${randomBytes(4).toString('hex')}`
  console.log('\nLoading the demo farm…')

  // Staff (placeholder 0700 000 00xx numbers).
  const people = [
    ['Emeka Nwosu (demo)', '07000000001', 'farm_manager'],
    ['Funmi Adebayo (demo)', '07000000002', 'sales_accounts'],
    ['Bayo Lawal (demo)', '07000000003', 'store_keeper'],
    ['Musa Ibrahim (demo)', '07000000004', 'pen_attendant'],
    ['Kemi Adewale (demo)', '07000000005', 'pen_attendant'],
    ['Yemi Okafor (demo)', '07000000006', 'pen_attendant_all'],
  ]
  const staff = {}
  for (const [name, phone, role] of people) {
    const normalised = normalisePhone(phone)
    const found = userList?.users.find((u) => u.email === loginEmail(normalised))
    if (found) {
      const { error } = await db.auth.admin.updateUserById(found.id, { password: demoPassword })
      if (error) throw new Error(`Updating ${name}: ${error.message}`)
      check(await db.from('profiles').update({ role_id: role }).eq('id', found.id), `Saving ${name}'s role`)
      staff[name.split(' ')[0]] = found.id
    } else {
      staff[name.split(' ')[0]] = await createAccount({ name, phone: normalised, password: demoPassword, role, demo: true })
    }
  }

  const birdType = await ids('bird_types')
  const feedType = await ids('feed_types')
  const medication = await ids('medications')
  const product = await ids('products')
  const category = await ids('expense_categories')

  /** Insert the rows not already there (matched on `key`); returns key → id for all of them. */
  async function ensure(table, key, rows) {
    const have = await existing(table, key)
    const missing = rows.filter((r) => !have.has(r[key]))
    if (missing.length) for (const r of check(await db.from(table).insert(missing, OPTS).select(`id, ${key}`), table)) have.set(r[key], r.id)
    return have
  }

  // Pens 1–4 layers, 5–6 broilers.
  const pen = Object.fromEntries(
    await ensure(
      'pens',
      'name',
      [1, 2, 3, 4, 5, 6].map((n) => ({ name: `Pen ${n}`, capacity: n <= 4 ? 1250 : 2000, bird_type_id: birdType.get(n <= 4 ? 'Layer' : 'Broiler') })),
    ),
  )

  // Flocks: [pen, code, weeks old today, birds placed, layers?]
  const flockSpec = [
    ['Pen 1', 'L-2511', 58, 1200, true],
    ['Pen 2', 'L-2602', 31, 1250, true],
    ['Pen 3', 'L-2540', 34, 1250, true],
    ['Pen 4', 'L-2604', 22, 1250, true],
    ['Pen 5', 'B-2636', 5, 2000, false],
    ['Pen 6', 'B-2639', 3, 1300, false],
  ]
  const flockId = await ensure(
    'flocks',
    'code',
    flockSpec.map(([p, code, weeks, birds, layers]) => ({
      code,
      pen_id: pen[p],
      bird_type_id: birdType.get(layers ? 'Layer' : 'Broiler'),
      breed: layers ? 'Isa Brown' : 'Ross 308',
      placed_on: daysAgo(weeks * 7 - 4),
      birds_placed: birds,
      created_by: ownerId,
    })),
  )

  check(
    await db.from('staff_pens').upsert(
      [...['Pen 3', 'Pen 4', 'Pen 5'].map((p) => ({ profile_id: staff.Musa, pen_id: pen[p] })), { profile_id: staff.Kemi, pen_id: pen['Pen 2'] }],
      { onConflict: 'profile_id,pen_id', ignoreDuplicates: true },
    ),
    'pen assignments',
  )

  const customer = Object.fromEntries(
    await ensure(
      'customers',
      'name',
      [
        { name: 'Mama Titi Stores', area: 'Bodija', buys: ['eggs'], opening_balance: 212500, opening_balance_source: 'Ledger book (demo)', whatsapp_opt_in: true },
        { name: 'Chief Bello Caterers', area: 'Ring Road', buys: ['eggs', 'birds'], opening_balance: 84000, opening_balance_source: 'Ledger book (demo)', whatsapp_opt_in: true },
        { name: 'Unity Hotels', area: 'Dugbe', buys: ['eggs'], opening_balance: 0, whatsapp_opt_in: false },
        { name: 'Mrs Okafor', area: 'Agodi', buys: ['eggs'], opening_balance: 0, whatsapp_opt_in: true },
        { name: 'Ibadan Fresh Mart', area: 'Challenge', buys: ['eggs', 'droppings'], opening_balance: 45000, opening_balance_source: 'WhatsApp records (demo)', whatsapp_opt_in: true },
      ].map((c) => ({ ...c, created_by: ownerId })),
    ),
  )

  const supplier = Object.fromEntries(
    await ensure(
      'suppliers',
      'name',
      [
        { name: 'Greenfield Feeds', supplies: ['feed'], payment_terms_days: 7, phone: '0809 000 3360', opening_balance: 160000 },
        { name: 'VetCare Pharma', supplies: ['medication'], payment_terms_days: 14, phone: '0803 000 1101', opening_balance: 0 },
        { name: 'Oyo Hatcheries', supplies: ['birds'], payment_terms_days: 0, phone: '0805 000 4412', opening_balance: 0 },
        { name: 'Ibadan Crates & Cages', supplies: ['equipment'], payment_terms_days: 30, phone: '0812 000 7781', opening_balance: 0 },
      ].map((s) => ({ ...s, created_by: ownerId })),
    ),
  )

  // Opening stock eight days ago.
  const openingOn = daysAgo(8)
  check(
    await db.from('stock_adjustments').insert([
      ...[['Layer mash', 160], ['Broiler finisher', 120], ['Broiler starter', 90], ['Grower mash', 62], ['Chick mash', 20]].map(([f, bags]) => ({ item: 'feed', feed_type_id: feedType.get(f), quantity_change: bags })),
      ...[['Vitalyte (Vitamin C)', 1450], ['Amprolium 20%', 300], ['Gumboro (IBD) vaccine', 3], ['Lasota (ND) vaccine', 4], ['Piperazine', 800], ['Virkon S', 4]].map(([m, q]) => ({ item: 'medication', medication_id: medication.get(m), quantity_change: q })),
      { item: 'eggs', quantity_change: 1800 },
    ].map((a) => ({ ...a, adjusted_on: openingOn, is_opening: true, recorded_by: staff.Bayo, note: 'Opening stock (demo)' })), OPTS),
    'opening stock',
  )

  // Purchases: received feed, received medication batch, and a feed order waiting at the gate.
  check(
    await db.from('purchases').insert([
      { ref: null, kind: 'feed', purchased_on: daysAgo(5), supplier_id: supplier['Greenfield Feeds'], feed_type_id: feedType.get('Layer mash'), quantity: 100, unit: 'bags', unit_price: 18500, amount_paid: 1000000, payment_method: 'transfer', status: 'received', received_on: daysAgo(5), received_quantity: 100, received_by: staff.Bayo, recorded_by: staff.Funmi },
      { ref: null, kind: 'medication', purchased_on: daysAgo(4), supplier_id: supplier['VetCare Pharma'], medication_id: medication.get('Amoxicillin 20%'), quantity: 4, unit: 'packs of 100 g', stock_units_per_unit: 100, unit_price: 8500, amount_paid: 34000, payment_method: 'transfer', batch_no: 'AX-2209', expiry_date: '2027-08-31', status: 'received', received_on: daysAgo(4), received_quantity: 4, received_by: staff.Bayo, recorded_by: staff.Funmi },
      { ref: null, kind: 'feed', purchased_on: daysAgo(1), supplier_id: supplier['Greenfield Feeds'], feed_type_id: feedType.get('Broiler finisher'), quantity: 60, unit: 'bags', unit_price: 19200, amount_paid: 0, status: 'ordered', recorded_by: staff.Funmi, notes: 'Demo order' },
    ], OPTS),
    'purchases',
  )

  // Seven days of production, oldest first, so bird counts carry forward. Today is left for the attendants.
  const grams = (layers, weeks) => (layers ? (weeks >= 19 ? 115 : weeks >= 17 ? 95 : 68) : [20, 45, 75, 110, 145, 165][Math.min(weeks, 6) - 1])
  const feedFor = (layers, weeks) => (layers ? (weeks >= 17 ? 'Layer mash' : 'Grower mash') : weeks >= 4 ? 'Broiler finisher' : 'Broiler starter')
  const live = Object.fromEntries(flockSpec.map(([p, , , birds]) => [p, birds]))
  const recorder = { 'Pen 1': staff.Yemi, 'Pen 2': staff.Kemi, 'Pen 3': staff.Musa, 'Pen 4': staff.Musa, 'Pen 5': staff.Musa, 'Pen 6': staff.Yemi }
  for (let back = 7; back >= 1; back--) {
    for (const [p, code, weeks, , layers] of flockSpec) {
      const w = weeks - Math.floor(back / 7)
      const died = (back * 7 + p.length * 3 + w) % 4 === 0 ? 2 : (back + w) % 3 === 0 ? 1 : 0
      const birds = live[p] - died
      const bags = Math.round(((birds * grams(layers, w)) / 1000 / 25) * (1 + (((back * 13) % 9) - 4) / 100) * 10) / 10
      const eggs = layers ? Math.round(birds * (w >= 30 ? 0.88 : w >= 22 ? 0.84 : 0.7)) : null
      check(
        await db.from('production_records').insert({
          pen_id: pen[p],
          flock_id: flockId.get(code),
          record_date: daysAgo(back),
          mortality: died,
          feed_type_id: feedType.get(feedFor(layers, w)),
          feed_bags: bags,
          eggs_collected: eggs,
          eggs_cracked: eggs ? Math.round(eggs * 0.02) : null,
          recorded_by: recorder[p],
        }),
        `production ${p} ${daysAgo(back)}`,
      )
      live[p] = birds
    }
  }

  // Sales, payments and expenses.
  const eggs = product.get('Eggs · crate of 30')
  const sale = (back, who, crates, price, paid) => ({ sold_on: daysAgo(back), customer_id: customer[who], product_id: eggs, quantity: crates, unit_price: price, amount_paid: paid, payment_method: paid ? 'transfer' : null, recorded_by: staff.Funmi })
  check(
    await db.from('sales').insert([
      sale(6, 'Mama Titi Stores', 40, 4200, 0),
      sale(5, 'Chief Bello Caterers', 25, 4200, 105000),
      sale(4, 'Unity Hotels', 30, 4300, 129000),
      sale(3, 'Mrs Okafor', 10, 4200, 20000),
      sale(2, 'Ibadan Fresh Mart', 35, 4150, 100000),
      sale(1, 'Mama Titi Stores', 30, 3800, 0), // below the ₦4,000 minimum → waits for approval
      { sold_on: daysAgo(1), customer_id: null, buyer_name: 'Walk-in buyer', product_id: eggs, quantity: 2, unit_price: 4500, amount_paid: 9000, payment_method: 'cash', recorded_by: staff.Funmi },
    ], OPTS),
    'sales',
  )
  check(
    await db.from('payments').insert([
      { ref: null, paid_on: daysAgo(3), direction: 'in', customer_id: customer['Mama Titi Stores'], amount: 100000, method: 'transfer', reference: 'TRF-DEMO-1', notes: 'Opening balance (demo)', recorded_by: staff.Funmi },
      { ref: null, paid_on: daysAgo(2), direction: 'out', supplier_id: supplier['Greenfield Feeds'], amount: 160000, method: 'transfer', reference: 'TRF-DEMO-2', notes: 'Opening balance (demo)', recorded_by: staff.Funmi },
    ], OPTS),
    'payments',
  )
  check(
    await db.from('expenses').insert([
      { spent_on: daysAgo(6), category_id: category.get('Labour'), description: 'Casual labour — pen cleaning (demo)', amount: 25000, amount_paid: 25000, payment_method: 'cash', recorded_by: staff.Funmi },
      { spent_on: daysAgo(3), category_id: category.get('Fuel & power'), description: 'Diesel for the generator (demo)', amount: 48000, amount_paid: 48000, payment_method: 'transfer', recorded_by: staff.Funmi },
      { spent_on: daysAgo(2), category_id: category.get('Vet services'), description: 'Vet visit — Pen 2 (demo)', amount: 30000, amount_paid: 30000, payment_method: 'transfer', pen_id: pen['Pen 2'], recorded_by: staff.Kemi },
      { spent_on: daysAgo(1), category_id: category.get('Equipment'), description: '20 egg crates (demo)', amount: 60000, amount_paid: 20000, payment_method: 'cash', supplier_id: supplier['Ibadan Crates & Cages'], recorded_by: staff.Funmi },
    ], OPTS),
    'expenses',
  )

  console.log('✓ Demo farm loaded: 6 pens, 6 flocks, 7 days of entries, customers, suppliers, sales and expenses.')
  console.log('\nDemo staff (password for all of them, shown once):', demoPassword)
  for (const [name, phone, role] of people) console.log(`  ${name.padEnd(22)} ${phone}  ${role}`)
  console.log('Remove all of this before go-live with: node backend/scripts/remove-demo.mjs')
}

// ── Run ─────────────────────────────────────────────────────────────

try {
  const ownerId = await setupOwner()
  if (process.argv.includes('--demo')) await setupDemo(ownerId)
} catch (e) {
  console.error('\n✗', e.message)
  process.exitCode = 1
} finally {
  rl.close()
}
