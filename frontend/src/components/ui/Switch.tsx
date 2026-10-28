import { cn } from '../../lib/cn'

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 type-body-md text-fg-primary">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-out', checked ? 'bg-brand' : 'bg-muted')}
      >
        {/* Moves with transform, not `left`, so the browser only composites. */}
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-sm transition-transform duration-200 ease-out',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
      {label}
    </label>
  )
}
