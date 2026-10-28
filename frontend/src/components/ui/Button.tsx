import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  leadingIcon?: LucideIcon
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-fg-on-brand enabled:hover:bg-brand-hover shadow-xs disabled:bg-muted disabled:text-fg-disabled disabled:shadow-none',
  secondary: 'bg-surface text-fg-primary border border-line-strong enabled:hover:bg-subtle shadow-xs disabled:border-line disabled:text-fg-disabled disabled:shadow-none',
  ghost: 'text-fg-primary enabled:hover:bg-subtle disabled:text-fg-disabled',
  danger: 'bg-danger text-fg-on-brand enabled:hover:bg-danger-hover shadow-xs disabled:bg-muted disabled:text-fg-disabled disabled:shadow-none',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 gap-1.5 type-label-md',
  md: 'h-10 px-4 gap-2 type-label-md',
  lg: 'h-12 px-5 gap-2 type-label-lg',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  leadingIcon: Icon,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-[background-color,border-color,color,box-shadow,transform] duration-(--dur-press) ease-out motion-safe:enabled:active:scale-[0.97] disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 16 : 20} strokeWidth={1.5} />}
      {children}
    </button>
  )
}
