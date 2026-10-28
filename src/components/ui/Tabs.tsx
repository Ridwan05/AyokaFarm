import { cn } from '../../lib/cn'
import { useActiveRect } from '../../lib/useActiveRect'
import { NavLink } from './NavLink'

type TabsProps<T extends string> = {
  tabs: readonly T[]
  value: T
  onChange: (value: T) => void
  label: string
}

/** Underlined page tabs. The underline slides between tabs. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: TabsProps<T>) {
  const { ref, rect, ready } = useActiveRect<HTMLDivElement>(value)
  return (
    <div ref={ref} role="tablist" aria-label={label} className="relative flex gap-6 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active = tab === value
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onChange(tab)}
            className={cn(
              'flex h-10 shrink-0 cursor-pointer items-center px-1 whitespace-nowrap',
              active ? 'type-label-md text-fg-primary' : 'type-body-md text-fg-secondary hover:text-fg-primary',
            )}
          >
            {tab}
          </button>
        )
      })}
      {/* One full-width bar, scaled and moved with transform only. */}
      {rect && (
        <span
          aria-hidden
          style={{ transform: `translateX(${rect.left}px) scaleX(${rect.width / rect.containerWidth})` }}
          className={cn(
            'pointer-events-none absolute bottom-0 left-0 h-0.5 w-full origin-left bg-line-brand',
            ready && 'transition-transform duration-200 ease-in-out motion-reduce:transition-none',
          )}
        />
      )}
    </div>
  )
}

/** Tabs that switch routes, e.g. Inventory · Feed / Medication / Eggs. */
export function LinkTabs({ tabs, label }: { tabs: { label: string; to: string }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-6 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          href={tab.to}
          end
          className={({ isActive }) =>
            cn(
              '-mb-px flex h-10 shrink-0 items-center px-1 whitespace-nowrap',
              isActive
                ? 'border-b-2 border-line-brand type-label-md text-fg-primary'
                : 'type-body-md text-fg-secondary hover:text-fg-primary',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
