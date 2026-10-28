import type { ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '../../lib/cn'

type CardProps = {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <section className={cn('flex flex-col rounded-xl border border-line bg-surface', className)}>
      {children}
    </section>
  )
}

type CardHeaderProps = {
  title: string
  /** Inline content after the title, e.g. a badge or a count. */
  meta?: ReactNode
  action?: { label: string; to?: string; onClick?: () => void }
  className?: string
}

export function CardHeader({ title, meta, action, className }: CardHeaderProps) {
  return (
    <header className={cn('flex items-center gap-2 px-5 pt-4 pb-3', className)}>
      <h2 className="type-h3 text-fg-primary">{title}</h2>
      {meta}
      <span className="flex-1" />
      {action &&
        (action.onClick ? (
          <button type="button" onClick={action.onClick} className="cursor-pointer type-label-sm text-fg-brand hover:underline">
            {action.label}
          </button>
        ) : (
          <CardLink to={action.to ?? '#'}>{action.label}</CardLink>
        ))}
    </header>
  )
}

export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link href={to} className="type-label-sm text-fg-brand hover:underline">
      {children}
    </Link>
  )
}
