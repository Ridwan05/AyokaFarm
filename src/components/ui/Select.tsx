import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

type SelectProps<T extends string> = {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  label: string
  leadingIcon?: LucideIcon
  /** Trigger width in px. */
  width?: number
  /** Display text for an option, when it differs from the value. */
  format?: (value: T) => string
}

export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
  leadingIcon: Icon,
  width = 220,
  format = (v) => v,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0" style={{ width }}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-left"
      >
        {Icon && <Icon size={20} strokeWidth={1.5} className="shrink-0 text-icon-secondary" />}
        <span className="flex-1 truncate type-body-md text-fg-primary">{format(value)}</span>
        <ChevronDown size={20} strokeWidth={1.5} className="shrink-0 text-icon-secondary" />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="ayk-pop absolute top-full right-0 left-0 z-20 mt-1 origin-top rounded-md border border-line bg-surface p-1 shadow-md"
        >
          {options.map((option) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
              className="flex h-9 cursor-pointer items-center gap-2 rounded-sm px-2 type-body-md text-fg-primary hover:bg-subtle"
            >
              <span className="flex-1">{format(option)}</span>
              {option === value && <Check size={16} strokeWidth={1.5} className="text-icon-brand" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
