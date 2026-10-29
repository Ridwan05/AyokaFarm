import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RowMenu, type MenuItem } from '../../components/ui/Menu'
import { Presence } from '../../components/ui/Overlay'
import { canCorrectEntry, canDeleteEntry } from '../../data/production'
import type { DailyRow } from '../../data/remote'
import { useCurrentUser } from '../../data/sessionContext'
import { DeleteEntryModal } from './DeleteEntryModal'

/** "…" menu on a saved daily entry: correct it (edit window) or delete it (owner). Nothing if neither applies. */
export function EntryActions({ row }: { row: DailyRow | undefined }) {
  const router = useRouter()
  const user = useCurrentUser()
  const [deleting, setDeleting] = useState(false)
  if (!row) return null
  const items: MenuItem[] = []
  if (canCorrectEntry(user, row)) items.push({ label: 'Correct entry…', onSelect: () => router.push(`/production/entry/${row.penId}?entry=${row.id}`) })
  if (canDeleteEntry(user)) items.push({ label: 'Delete entry…', danger: true, onSelect: () => setDeleting(true) })
  if (!items.length) return null
  return (
    // React events bubble out of portals too: keep clicks in the modal from opening the row.
    <span onClick={(e) => e.stopPropagation()}>
      <RowMenu label="Entry actions" items={items} />
      <Presence>{deleting && <DeleteEntryModal row={row} onClose={() => setDeleting(false)} />}</Presence>
    </span>
  )
}
