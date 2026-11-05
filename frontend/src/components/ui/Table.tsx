import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Avatar } from './Avatar'
import { PAGE_SIZE, Pager, usePage } from './Pager'

/** One table column: its header and how to draw each row's cell. */
export type Column<Row> = {
  key: string
  header: string
  align?: 'left' | 'right'
  /** Fixed width in px; omit to let the column grow. */
  width?: number
  render: (row: Row) => ReactNode
}

type TableProps<Row> = {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  onRowClick?: (row: Row) => void
  /** Adds a trailing actions column, e.g. a RowMenu. */
  rowActions?: (row: Row) => ReactNode
  /** Extra classes per row, e.g. to highlight one waiting for approval. */
  rowClassName?: (row: Row) => string | undefined
  /** Width of the actions column. */
  actionsWidth?: number
  /** Rows per page; Infinity shows them all. */
  pageSize?: number
}

/** Columns without a width get at least this much; below that the table scrolls sideways instead of squeezing them. */
const FLEX_COLUMN_MIN = 200
/** The same floor on wider screens, where there's more room to share. */
const FLEX_COLUMN_MIN_LG = 140

// On narrow screens the table scrolls inside its card and the first column stays put,
// so each row keeps its name in view.
const stickyFirst = 'max-lg:sticky max-lg:left-0 max-lg:z-[1] max-lg:bg-surface'

/**
 * Data table for lists like sales or pens. Rows can open a detail on click and carry a "…" menu.
 * Shows 20 rows a page. When the columns don't fit it scrolls sideways (first column pinned on narrow
 * screens), and text too long for its cell ends in "…".
 */
export function Table<Row>({ columns, rows, rowKey, onRowClick, rowActions, rowClassName, actionsWidth = 64, pageSize = PAGE_SIZE }: TableProps<Row>) {
  const paged = usePage(rows, pageSize)
  const minWidth = (flex: number) => columns.reduce((n, c) => n + (c.width ?? flex), rowActions ? actionsWidth : 0)
  return (
    <>
      {/* `relative` keeps absolutely positioned bits (the sr-only "Actions" label) inside the scroller. */}
      <div className="relative overflow-x-auto overscroll-x-contain">
        <table
          className="w-full table-fixed border-collapse max-lg:min-w-(--table-min) lg:min-w-(--table-min-lg)"
          style={{ '--table-min': `${minWidth(FLEX_COLUMN_MIN)}px`, '--table-min-lg': `${minWidth(FLEX_COLUMN_MIN_LG)}px` } as CSSProperties}
        >
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
            {rowActions && <col style={{ width: actionsWidth }} />}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  title={c.header}
                  className={cn(
                    'h-10 truncate border-b border-line px-4 type-overline text-fg-tertiary',
                    c.align === 'right' ? 'text-right' : 'text-left',
                    i === 0 && stickyFirst,
                  )}
                >
                  {c.header}
                </th>
              ))}
              {rowActions && (
                <th className="border-b border-line">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paged.pageRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && 'cursor-pointer hover:bg-canvas', rowClassName?.(row))}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      'h-14 overflow-hidden border-b border-line-subtle px-4',
                      c.align === 'right' && 'text-right',
                      i === 0 && stickyFirst,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
                {rowActions && <td className="h-14 border-b border-line-subtle px-3 text-right">{rowActions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...paged} />
    </>
  )
}

/** "Primary" cell: avatar + name + context line. */
export function PrimaryCell({
  initials,
  title,
  subtitle,
}: {
  initials: string
  title: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar initials={initials} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate type-label-md text-fg-primary">{title}</span>
        {subtitle && <span className="truncate type-body-sm text-fg-tertiary">{subtitle}</span>}
      </div>
    </div>
  )
}

/** The cell's text for a hover title, so a value cut short with "…" can still be read in full. */
const fullText = (children: ReactNode) => (typeof children === 'string' || typeof children === 'number' ? String(children) : undefined)

const numberTones = {
  default: 'text-fg-primary',
  strong: 'text-fg-primary font-semibold',
  muted: 'text-fg-tertiary',
  warning: 'text-fg-warning',
  danger: 'text-fg-danger',
  success: 'text-fg-success',
}

/** "Number" cell: Numeric/MD with tabular figures. */
export function NumberCell({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: keyof typeof numberTones
}) {
  return (
    <span className={cn('block truncate type-numeric-md', numberTones[tone])} title={fullText(children)}>
      {children}
    </span>
  )
}

/** Plain text cell, e.g. age or "Recorded by". */
export function TextCell({
  children,
  tone = 'secondary',
  mono,
}: {
  children: ReactNode
  tone?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'info'
  mono?: boolean
}) {
  const color = {
    primary: 'text-fg-primary',
    secondary: 'text-fg-secondary',
    tertiary: 'text-fg-tertiary',
    danger: 'text-fg-danger',
    info: 'text-fg-info',
  }[tone]
  return (
    <span className={cn(mono ? 'type-mono-sm' : 'type-body-md', 'block truncate', color)} title={fullText(children)}>
      {children}
    </span>
  )
}
