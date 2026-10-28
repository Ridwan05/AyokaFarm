import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import Link from 'next/link'

type PageHeaderProps = {
  /** Small line above the title: a date, or a breadcrumb trail. */
  eyebrow?: string | string[]
  /** Shows a back arrow before the eyebrow, linking here. */
  backTo?: string
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, backTo, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {eyebrow && (
          <div className="flex items-center gap-1.5">
            {backTo && (
              <Link
                href={backTo}
                aria-label="Back"
                className="-ml-1.5 flex size-10 items-center justify-center rounded-md text-icon-secondary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94] lg:size-8"
              >
                <ArrowLeft size={16} strokeWidth={1.5} />
              </Link>
            )}
            <p className="min-w-0 overflow-hidden type-body-sm text-ellipsis whitespace-pre text-fg-tertiary">
              {Array.isArray(eyebrow) ? eyebrow.join('  /  ') : eyebrow}
            </p>
          </div>
        )}
        <h1 className="type-display-md text-fg-primary text-balance lg:type-display-lg">{title}</h1>
        {description && <p className="type-body-md text-fg-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  )
}
