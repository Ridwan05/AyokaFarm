#!/usr/bin/env node
// Removes the demo farm before go-live: every pen, flock, customer, supplier and farm record, plus
// the demo staff accounts. Keeps the Owner (and any real staff), roles, settings and lists.
//
//   node backend/scripts/remove-demo.mjs
//
// It deletes ALL farm records, demo or not — run it only before the farm starts using the app.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'

const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

const env = Object.fromEntries(
  readFileSync(new URL('../../frontend/.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in frontend/.env.local first.')
  process.exit(1)
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const rl = createInterface({ input: process.stdin, output: process.stdout })
const answer = await new Promise((resolve) => rl.question('This deletes every farm record and the demo staff. Type DELETE to continue: ', resolve))
rl.close()
if (answer.trim() !== 'DELETE') {
  console.log('Nothing deleted.')
  process.exit(0)
}

// Children before parents. Stock movements are cleared by triggers as their sources go.
const tables = ['production_medications', 'production_records', 'stock_adjustments', 'sales', 'payments', 'expenses', 'purchases', 'stock_movements', 'staff_pens', 'flocks', 'pens', 'customers', 'suppliers']
try {
  for (const table of tables) {
    // A filter is required for deletes; every row matches it. staff_pens has no id column.
    const { error } = await db.from(table).delete().gte(table === 'staff_pens' ? 'pen_id' : 'id', 0)
    if (error) throw new Error(`${table}: ${error.message}`)
    console.log(`✓ ${table} cleared`)
  }

  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  const demo = data.users.filter((u) => u.app_metadata?.demo === true)
  for (const u of demo) {
    const { error: e } = await db.auth.admin.deleteUser(u.id)
    if (e) throw new Error(`Deleting ${u.email}: ${e.message}`)
  }
  console.log(`✓ ${demo.length} demo staff accounts deleted`)
  console.log('The farm is empty and ready for go-live setup.')
} catch (e) {
  console.error('\n✗', e.message)
  process.exitCode = 1
}
