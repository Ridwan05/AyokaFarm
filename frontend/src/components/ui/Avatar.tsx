import { cn } from '../../lib/cn'

type AvatarProps = {
  initials: string
  className?: string
}

export function Avatar({ initials, className }: AvatarProps) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full border border-line-warning bg-accent-subtle type-label-sm text-fg-warning',
        className,
      )}
    >
      {initials}
    </span>
  )
}
