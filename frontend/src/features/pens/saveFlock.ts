import { toast } from 'sonner'
import type { TablesUpdate } from '../../lib/supabase/database.types'
import { createClient } from '../../lib/supabase/client'

/** Why a flock was closed (flocks.close_reason). */
export const CLOSE_REASONS = [
  { value: 'sold_out', label: 'Sold out' },
  { value: 'culled', label: 'Culled' },
  { value: 'moved', label: 'Moved to another farm' },
  { value: 'died', label: 'Died (disease or disaster)' },
  { value: 'other', label: 'Other' },
] as const

/** Change a flock, showing the database's reason in a toast if it refuses. Resolves true when saved. */
export async function saveFlock(id: number, patch: TablesUpdate<'flocks'>) {
  const { error } = await createClient().from('flocks').update(patch).eq('id', id)
  if (error) {
    toast.error(/row-level security|permission denied|42501/i.test(error.message) && !/owner/i.test(error.message) ? 'You don’t have permission to do that.' : error.message.replace(/^.*?ERROR:\s*/, ''))
    return false
  }
  return true
}
