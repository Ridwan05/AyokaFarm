import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from './Button'

/** Rows per page in every paginated table. */
export const PAGE_SIZE = 20

/**
 * Splits rows into pages. Goes back to page 1 when the number of rows changes (a filter changed),
 * and never points past the last page.
 */
export function usePage<Row>(rows: Row[], size = PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const [seen, setSeen] = useState(rows.length)
  if (seen !== rows.length) {
    setSeen(rows.length)
    setPage(1)
  }
  const total = rows.length
  const pages = Number.isFinite(size) ? Math.max(1, Math.ceil(total / size)) : 1
  const current = Math.min(page, pages)
  const from = pages === 1 ? 0 : (current - 1) * size
  const to = pages === 1 ? total : Math.min(total, from + size)
  return { pageRows: rows.slice(from, to), page: current, pages, setPage, from, to, total }
}

/** The table footer: "21–40 of 87", "Page 2 of 5" and previous / next buttons. Hidden when everything fits on one page. */
export function Pager({ page, pages, from, to, total, setPage }: ReturnType<typeof usePage>) {
  const ref = useRef<HTMLDivElement>(null)
  if (pages <= 1) return null
  const go = (p: number) => {
    setPage(p)
    // Bring the table's top back into view when it has scrolled off-screen.
    const table = ref.current?.previousElementSibling
    if (table && table.getBoundingClientRect().top < 0) table.scrollIntoView({ block: 'start' })
  }
  return (
    <div ref={ref} className="flex items-center justify-between gap-3 px-4 py-2">
      <span className="type-body-sm text-fg-tertiary tabular-nums">
        {from + 1}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <span className="mr-2 type-body-sm text-fg-secondary tabular-nums">
          Page {page} of {pages}
        </span>
        <Button variant="ghost" size="sm" className="w-8 px-0" aria-label="Previous page" leadingIcon={ChevronLeft} disabled={page <= 1} onClick={() => go(page - 1)} />
        <Button variant="ghost" size="sm" className="w-8 px-0" aria-label="Next page" leadingIcon={ChevronRight} disabled={page >= pages} onClick={() => go(page + 1)} />
      </div>
    </div>
  )
}
