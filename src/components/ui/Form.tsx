import { Calculator, CalendarDays, ChevronDown, Search, type LucideIcon } from 'lucide-react'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type FieldProps = {
  label: string
  hint?: ReactNode
  error?: string
  /** Shows the "Auto" tag: the value is computed, not typed. */
  auto?: boolean
  className?: string
  children: (id: string) => ReactNode
}

/** Label + control + hint. The control receives the generated id. */
export function Field({ label, hint, error, auto, className, children }: FieldProps) {
  const id = useId()
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="type-label-md text-fg-primary lg:whitespace-nowrap">
          {label}
        </label>
        {auto && <span className="rounded-xs bg-muted px-1.5 py-0.5 type-label-sm text-fg-secondary">Auto</span>}
      </div>
      {children(id)}
      {error ? (
        <p className="type-body-sm text-fg-danger">{error}</p>
      ) : (
        hint && <p className={cn('type-body-sm', auto ? 'text-fg-tertiary' : 'text-fg-secondary')}>{hint}</p>
      )}
    </div>
  )
}

const box =
  'flex w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-[1.5px] focus-within:border-line-focus focus-within:shadow-focus'

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> & {
  /** Text before the value, e.g. "₦". */
  prefix?: string
  suffix?: string
  leadingIcon?: LucideIcon
  invalid?: boolean
  /** md (40px) for dense side panels; lg (48px) is the form default and the minimum on touch screens. */
  size?: 'md' | 'lg'
}

export function TextInput({ prefix, suffix, leadingIcon: Icon, invalid, size = 'lg', className, ...props }: TextInputProps) {
  return (
    <div className={cn(box, size === 'lg' ? 'h-12' : 'h-10', invalid && 'border-line-danger', className)}>
      {Icon && <Icon size={20} strokeWidth={1.5} className="shrink-0 text-icon-secondary" />}
      {prefix && <span className="type-body-lg text-fg-tertiary">{prefix}</span>}
      <input
        {...props}
        className="min-w-0 flex-1 bg-transparent type-body-lg text-fg-primary outline-none placeholder:text-fg-disabled focus-visible:shadow-none"
      />
      {suffix && <span className="type-body-lg whitespace-nowrap text-fg-tertiary">{suffix}</span>}
    </div>
  )
}

export function DateInput(props: Omit<TextInputProps, 'type' | 'leadingIcon'>) {
  return <TextInput type="date" leadingIcon={CalendarDays} {...props} />
}

/** Read-only computed value. */
export function AutoInput({ id, value, prefix }: { id?: string; value: string; prefix?: string }) {
  return (
    <div className="flex h-12 w-full items-center gap-2 rounded-md bg-subtle px-3">
      {prefix && <span className="type-label-lg text-fg-tertiary">{prefix}</span>}
      <output id={id} className="flex-1 type-label-lg text-fg-primary">
        {value}
      </output>
      <Calculator size={20} strokeWidth={1.5} className="text-icon-secondary" />
    </div>
  )
}

type SelectInputProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  options: { value: string; label: string }[]
  leadingIcon?: LucideIcon
  /** md (40px) for dense settings pages; lg (48px) is the form default. */
  size?: 'md' | 'lg'
}

/** Form select. Native element for accessibility and mobile pickers. */
export function SelectInput({ options, leadingIcon: Icon, size = 'lg', className, ...props }: SelectInputProps) {
  return (
    <div className={cn(box, 'relative', size === 'lg' ? 'h-12' : 'h-10', className)}>
      {Icon && <Icon size={20} strokeWidth={1.5} className="shrink-0 text-icon-secondary" />}
      <select
        {...props}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-7 type-body-lg text-fg-primary outline-none focus-visible:shadow-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={20} strokeWidth={1.5} className="pointer-events-none absolute right-3 text-icon-secondary" />
    </div>
  )
}

/** Tinted panel of KeyValueRows summarising what will be saved. */
export function SummaryBox({ children }: { children: ReactNode }) {
  return <div className="flex flex-col rounded-lg bg-canvas px-4 pt-1 pb-2">{children}</div>
}

/** Filter-bar search box (40px). */
export function SearchInput({ label, width = 260, ...props }: Omit<TextInputProps, 'size' | 'leadingIcon'> & { label: string; width?: number }) {
  return (
    <div style={{ width }} className="shrink-0">
      <TextInput {...props} aria-label={label} size="md" leadingIcon={Search} className="[&_input]:type-body-md" />
    </div>
  )
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 type-body-md text-fg-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 cursor-pointer rounded-xs accent-[var(--ayk-color-bg-brand)]"
      />
      {label}
    </label>
  )
}
