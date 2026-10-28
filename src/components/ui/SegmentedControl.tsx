import { cn } from '../../lib/cn'
import { useActiveRect } from '../../lib/useActiveRect'

type SegmentedControlProps<T extends string> = {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  label: string
  /** Stretch segments to fill the width, as in forms. */
  fullWidth?: boolean
}

const segment = 'flex h-8 items-center justify-center rounded-sm px-3 whitespace-nowrap'

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  fullWidth,
}: SegmentedControlProps<T>) {
  const { ref, rect, ready } = useActiveRect<HTMLDivElement>(value)
  // A copy of the segments in their active style, clipped to the selected one. Moving the clip
  // slides the pill and changes the text colour in one motion — no mid-way mix of two colours.
  const clip = rect ? `inset(2px ${rect.containerWidth - rect.left - rect.width}px 2px ${rect.left}px round 6px)` : 'inset(50%)'

  return (
    // On a phone a long set of options scrolls sideways rather than pushing the page wider.
    <div className={cn('min-w-0 max-w-full overflow-x-auto rounded-md [scrollbar-width:none]', fullWidth && 'w-full')}>
      <div ref={ref} role="radiogroup" aria-label={label} className={cn('relative flex gap-0.5 rounded-md bg-subtle p-0.5', fullWidth ? 'w-full' : 'w-max')}>
        {options.map((option) => {
          const active = option === value
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              data-active={active}
              onClick={() => onChange(option)}
              className={cn(segment, 'cursor-pointer type-label-md text-fg-secondary transition-colors duration-150 hover:text-fg-primary', fullWidth && 'min-w-0 flex-1')}
            >
              {option}
            </button>
          )
        })}
        <div
          aria-hidden
          style={{ clipPath: clip }}
          className={cn(
            'pointer-events-none absolute inset-0 flex gap-0.5 p-0.5',
            ready && 'transition-[clip-path] duration-200 ease-in-out motion-reduce:transition-none',
          )}
        >
          {options.map((option) => (
            <span key={option} className={cn(segment, 'bg-surface type-label-md text-fg-primary', fullWidth && 'min-w-0 flex-1')}>
              {option}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
