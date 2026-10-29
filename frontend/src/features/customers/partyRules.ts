import type { Database } from '../../lib/supabase/database.types'

// Shared bits for adding and editing customers and suppliers.

type ProductKind = Database['public']['Enums']['product_kind']
type SupplierKind = Database['public']['Enums']['supplier_kind']

export const BUYS = ['Eggs', 'Broilers', 'Spent layers', 'Droppings'] as const

/** "Broilers" → the product kinds stored on the customer. */
export function buysKinds(label: string): ProductKind[] {
  if (label === 'Eggs') return ['eggs']
  if (label === 'Droppings') return ['droppings']
  return ['birds']
}

/** The stored kinds back to the select's label. */
export function buysLabel(kinds: ProductKind[]): string {
  if (kinds.includes('eggs')) return 'Eggs'
  if (kinds.includes('droppings')) return 'Droppings'
  if (kinds.includes('birds')) return 'Broilers'
  return 'Eggs'
}

export const SUPPLIER_KINDS = ['Feed', 'Birds', 'Medication', 'Equipment'] as const
export const supplierKind = (label: (typeof SUPPLIER_KINDS)[number]) => label.toLowerCase() as SupplierKind

export const TERMS = [
  { value: '0', label: 'On delivery' },
  { value: '7', label: '7 days after delivery' },
  { value: '14', label: '14 days after delivery' },
  { value: '30', label: '30 days after delivery' },
]

/** A database error as a sentence for a toast. */
export function friendlyError(message: string) {
  if (/row-level security|permission denied|42501/i.test(message)) return 'You don’t have permission to do that.'
  if (/duplicate key.*suppliers_name/i.test(message)) return 'A supplier with that name already exists.'
  return message.replace(/^.*?ERROR:\s*/, '')
}

export const REFUSED = 'You don’t have permission to change this.'
