import { Banknote, ChevronRight, Clock, HeartPulse, Package, Wheat, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '../../lib/cn'

export type AlertKind = 'mortality' | 'debt' | 'feed' | 'stock' | 'missing-entry'
export type AlertTone = 'danger' | 'warning' | 'info'

const icons: Record<AlertKind, LucideIcon> = {
  mortality: HeartPulse,
  debt: Banknote,
  feed: Wheat,
  stock: Package,
  'missing-entry': Clock,
}

const tiles: Record<AlertTone, string> = {
  danger: 'bg-danger-subtle text-icon-danger',
  warning: 'bg-warning-subtle text-icon-warning',
  info: 'bg-info-subtle text-icon-info',
}

type AlertRowProps = {
  kind: AlertKind
  tone: AlertTone
  title: string
  detail: string
  time: string
  /** Navigate on click… */
  to?: string
  /** …or select in place (master–detail). */
  onSelect?: () => void
  selected?: boolean
  last?: boolean
}

/** 64px alert row: icon tile, title + detail, time, chevron. */
export function AlertRow({ kind, tone, title, detail, time, to, onSelect, selected, last }: AlertRowProps) {
  const Icon = icons[kind]
  const className = cn(
    'flex h-16 w-full items-center gap-3 py-3 pr-3 pl-4 text-left',
    selected ? 'bg-subtle' : 'hover:bg-canvas',
    !last && 'border-b border-line-subtle',
    last && 'rounded-b-xl',
  )
  const content = (
    <>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', tiles[tone])}>
        <Icon size={18} strokeWidth={1.5} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-label-md text-fg-primary">{title}</span>
        <span className="truncate type-body-sm text-fg-secondary">{detail}</span>
      </span>
      <span className="type-body-sm text-fg-tertiary">{time}</span>
      <ChevronRight size={16} strokeWidth={1.5} className="text-icon-secondary" />
    </>
  )
  return to ? (
    <Link href={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={cn(className, 'cursor-pointer')}>
      {content}
    </button>
  )
}
