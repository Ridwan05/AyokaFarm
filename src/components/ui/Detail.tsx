import type { ReactNode } from 'react'

/** Bordered section inside a detail drawer (e.g. "Sale", "Payment"). */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border border-line px-4 pt-3 pb-1">
      <h3 className="pb-1 type-label-lg text-fg-primary">{title}</h3>
      {children}
    </section>
  )
}

/** Audit trail: every change keeps a name. */
export function History({ events }: { events: { title: string; detail: string; time: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline">
        <h3 className="flex-1 type-h2 text-fg-primary">History</h3>
        <span className="type-body-sm text-fg-tertiary">Every change keeps a name</span>
      </div>
      <ol className="rounded-xl border border-line p-4">
        {events.map((e, i) => (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < events.length - 1 && <span className="absolute top-3 bottom-0 left-[3px] w-px bg-line" />}
            <span className="mt-1.5 size-[7px] shrink-0 rounded-full bg-brand" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="type-label-md text-fg-primary">{e.title}</span>
              <span className="type-body-sm text-fg-tertiary">{e.detail}</span>
            </div>
            <span className="type-mono-sm text-fg-tertiary">{e.time}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
