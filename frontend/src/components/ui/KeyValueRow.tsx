import { Calculator } from 'lucide-react'
import type { ReactNode } from 'react'

type KeyValueRowProps = {
  label: string
  children: ReactNode
  /** Marks values the system calculates rather than someone typing them. */
  calculated?: boolean
  /** The line that matters most, e.g. a total. */
  strong?: boolean
}

export function KeyValueRow({ label, children, calculated, strong }: KeyValueRowProps) {
  if (strong) {
    return (
      <div className="flex min-h-9 items-center gap-2 border-t border-line pt-3 pb-2">
        <span className="type-label-md text-fg-primary">{label}</span>
        {calculated && <CalcIcon />}
        <span className="flex-1" />
        <span className="type-h2 text-right text-fg-primary">{children}</span>
      </div>
    )
  }
  return (
    <div className="flex h-9 items-center gap-2 py-2">
      <span className="type-body-md whitespace-nowrap text-fg-secondary">{label}</span>
      {calculated && <CalcIcon />}
      <span className="flex-1" />
      <span className="type-label-md text-right whitespace-nowrap text-fg-primary">{children}</span>
    </div>
  )
}

function CalcIcon() {
  return (
    <span title="Calculated automatically" aria-label="Calculated automatically" className="text-icon-secondary">
      <Calculator size={14} strokeWidth={1.5} />
    </span>
  )
}
