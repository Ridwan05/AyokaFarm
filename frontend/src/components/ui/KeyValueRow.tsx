import type { ReactNode } from 'react'
import { InfoTip } from './InfoTip'

type KeyValueRowProps = {
  label: string
  children: ReactNode
  /** For values the system calculates: how it's worked out, shown from an info icon. */
  calculated?: string
  /** The line that matters most, e.g. a total. */
  strong?: boolean
}

export function KeyValueRow({ label, children, calculated, strong }: KeyValueRowProps) {
  const tip = calculated ? <InfoTip label={label}>{calculated}</InfoTip> : null
  if (strong) {
    return (
      <div className="flex min-h-9 items-center gap-2 border-t border-line pt-3 pb-2">
        <span className="type-label-md text-fg-primary">{label}</span>
        {tip}
        <span className="flex-1" />
        <span className="type-h2 text-right text-fg-primary">{children}</span>
      </div>
    )
  }
  return (
    <div className="flex h-9 items-center gap-2 py-2">
      <span className="type-body-md whitespace-nowrap text-fg-secondary">{label}</span>
      {tip}
      <span className="flex-1" />
      <span className="type-label-md text-right whitespace-nowrap text-fg-primary">{children}</span>
    </div>
  )
}
