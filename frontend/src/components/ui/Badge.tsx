import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<Tone, { bg: string; text: string; dot: string }> = {
  neutral: { bg: 'bg-subtle', text: 'text-fg-secondary', dot: 'bg-icon-secondary' },
  success: { bg: 'bg-success-subtle', text: 'text-fg-success', dot: 'bg-icon-success' },
  warning: { bg: 'bg-warning-subtle', text: 'text-fg-warning', dot: 'bg-icon-warning' },
  danger: { bg: 'bg-danger-subtle', text: 'text-fg-danger', dot: 'bg-icon-danger' },
  info: { bg: 'bg-info-subtle', text: 'text-fg-info', dot: 'bg-icon-info' },
}

type BadgeProps = {
  tone?: Tone
  dot?: boolean
  children: ReactNode
  className?: string
}

/** Record status. Text always carries the meaning; colour only reinforces it. */
export function Badge({ tone = 'neutral', dot = false, children, className }: BadgeProps) {
  const t = tones[tone]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 whitespace-nowrap type-label-sm',
        t.bg,
        t.text,
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  )
}
