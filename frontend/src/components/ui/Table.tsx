import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Avatar } from './Avatar'

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
}

/** On narrow screens, columns without a width get at least this much before the table scrolls sideways. */
const FLEX_COLUMN_MIN = 200

// On narrow screens the table scrolls inside its card and the first column stays put,
// so each row keeps its name in view.
const stickyFirst = 'max-lg:sticky max-lg:left-0 max-lg:z-[1] max-lg:bg-surface'

export function Table<Row>({ columns, rows, rowKey, onRowClick, rowActions, rowClassName, actionsWidth = 64 }: TableProps<Row>) {
  const minWidth = columns.reduce((n, c) => n + (c.width ?? FLEX_COLUMN_MIN), rowActions ? actionsWidth : 0)
  return (
    // `relative` keeps absolutely positioned bits (the sr-only "Actions" label) inside the scroller.
    <div className="relative overflow-x-auto overscroll-x-contain">
      <table className="w-full table-fixed border-collapse max-lg:min-w-(--table-min)" style={{ '--table-min': `${minWidth}px` } as CSSProperties}>
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
                className={cn(
                  'h-10 border-b border-line px-4 type-overline whitespace-nowrap text-fg-tertiary',
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
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer hover:bg-canvas', rowClassName?.(row))}
            >
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    'h-14 border-b border-line-subtle px-4',
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
    <div className="flex items-center gap-2">
      <Avatar initials={initials} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate type-label-md text-fg-primary">{title}</span>
        {subtitle && <span className="truncate type-body-sm text-fg-tertiary">{subtitle}</span>}
      </div>
    </div>
  )
}

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
  return <span className={cn('type-numeric-md whitespace-nowrap', numberTones[tone])}>{children}</span>
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
  return <span className={cn(mono ? 'type-mono-sm' : 'type-body-md', 'whitespace-nowrap', color)}>{children}</span>
}
