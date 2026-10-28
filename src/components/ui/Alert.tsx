import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const tones: Record<AlertTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'bg-info-subtle border-line-info', icon: 'text-icon-info', Icon: Info },
  success: { box: 'bg-success-subtle border-line-success', icon: 'text-icon-success', Icon: CircleCheck },
  warning: { box: 'bg-warning-subtle border-line-warning', icon: 'text-icon-warning', Icon: TriangleAlert },
  danger: { box: 'bg-danger-subtle border-line-danger', icon: 'text-icon-danger', Icon: CircleAlert },
}

type AlertProps = {
  tone?: AlertTone
  title: string
  children?: ReactNode
  /** Inline action under the text, e.g. a link or button. */
  action?: ReactNode
  /** Buttons on the right, e.g. Reject / Approve. Makes the banner compact. */
  actions?: ReactNode
  icon?: LucideIcon
  /** Single-line banner with small body text (implied when `actions` is set). */
  compact?: boolean
  onDismiss?: () => void
}

export function Alert({ tone = 'info', title, children, action, actions, icon, compact, onDismiss }: AlertProps) {
  const t = tones[tone]
  const Icon = icon ?? t.Icon
  compact = compact || !!actions
  return (
    <div role="status" className={cn('flex gap-3 rounded-lg border', compact ? 'items-center px-4 py-3' : 'items-start p-4', t.box)}>
      <Icon size={20} strokeWidth={1.5} className={cn('shrink-0', t.icon)} />
      <div className={cn('flex min-w-0 flex-1 flex-col items-start', !compact && 'gap-1')}>
        <p className="type-label-md text-fg-primary">{title}</p>
        {children && <div className={cn(compact ? 'type-body-sm' : 'type-body-md', 'text-fg-secondary')}>{children}</div>}
        {action}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="cursor-pointer rounded-sm text-icon-secondary hover:text-icon-primary"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}

/** Underlined brand-coloured inline action, as used inside alerts. */
export function AlertAction({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer type-label-md text-fg-brand underline underline-offset-2"
    >
      {children}
    </button>
  )
}
