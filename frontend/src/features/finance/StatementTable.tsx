import { ChevronRight } from 'lucide-react'
import { InfoTip } from '../../components/ui/InfoTip'
import type { Line } from '../../data/finance'
import { cn } from '../../lib/cn'
import { money } from './statementFormat'

// One financial statement as a table: section headings, lines that open their records, and
// subtotals. Negative amounts are shown in brackets, as accountants write them.

export type StatementRow =
  | { type: 'heading'; label: string }
  | { type: 'line'; line: Line; prev?: number | null }
  | { type: 'total'; label: string; amount: number; prev?: number | null; info?: string; grand?: boolean }

type Props = {
  rows: StatementRow[]
  /** Heading of the comparison column (e.g. "Last month"); omit to hide it. */
  prevLabel?: string
  currentLabel: string
  /** Show each figure as a % of this (revenue), for the Income Statement. */
  percentOf?: number
  onOpen: (line: Line) => void
}

export function StatementTable({ rows, prevLabel, currentLabel, percentOf, onOpen }: Props) {
  const pct = (n: number) => (percentOf ? `${((n / percentOf) * 100).toFixed(1)}%` : '—')
  return (
    // The table scrolls sideways inside its card on phones; the page doesn't.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse type-body-md">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-2 pr-3 pl-5 type-overline text-fg-tertiary">Item</th>
            <th className="w-[150px] py-2 pr-3 text-right type-overline text-fg-tertiary">{currentLabel}</th>
            {prevLabel && <th className="w-[150px] py-2 pr-3 text-right type-overline text-fg-tertiary">{prevLabel}</th>}
            {percentOf !== undefined && <th className="w-[90px] py-2 pr-5 text-right type-overline text-fg-tertiary">% of revenue</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            if (r.type === 'heading') {
              return (
                <tr key={`h${i}`}>
                  <td colSpan={4} className="pt-5 pb-1 pl-5 type-label-sm tracking-wide text-fg-secondary uppercase">
                    {r.label}
                  </td>
                </tr>
              )
            }
            if (r.type === 'total') {
              return (
                <tr key={`t${i}`} className={cn('border-t', r.grand ? 'border-line-strong bg-canvas' : 'border-line')}>
                  <td className={cn('py-2.5 pr-3 pl-5', r.grand ? 'type-label-lg text-fg-primary' : 'type-label-md text-fg-primary')}>
                    <span className="inline-flex items-center gap-1.5">
                      {r.label}
                      {r.info && <InfoTip label={r.label}>{r.info}</InfoTip>}
                    </span>
                  </td>
                  <td className={cn('py-2.5 pr-3 text-right whitespace-nowrap', r.grand ? 'type-label-lg' : 'type-label-md', r.amount < 0 ? 'text-fg-danger' : 'text-fg-primary')}>{money(r.amount)}</td>
                  {prevLabel && <td className="py-2.5 pr-3 text-right whitespace-nowrap type-label-md text-fg-secondary">{money(r.prev)}</td>}
                  {percentOf !== undefined && <td className="py-2.5 pr-5 text-right type-body-sm text-fg-tertiary">{pct(r.amount)}</td>}
                </tr>
              )
            }
            const { line, prev } = r
            return (
              <tr key={line.key} className="border-t border-line-subtle">
                <td className="py-2 pr-3 pl-8">
                  <span className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpen(line)}
                      className="cursor-pointer text-left text-fg-secondary underline decoration-line-strong decoration-dotted underline-offset-4 transition-colors duration-(--dur-press) hover:text-fg-primary"
                    >
                      {line.label}
                    </button>
                    <InfoTip label={line.label}>{line.info}</InfoTip>
                  </span>
                </td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onOpen(line)}
                    aria-label={`Show the records behind ${line.label}`}
                    className="inline-flex cursor-pointer items-center gap-0.5 type-label-md text-fg-primary transition-colors duration-(--dur-press) hover:text-fg-brand"
                  >
                    {money(line.amount)}
                    <ChevronRight size={14} strokeWidth={1.5} className="text-icon-secondary print:hidden" aria-hidden />
                  </button>
                </td>
                {prevLabel && <td className="py-2 pr-3 text-right whitespace-nowrap text-fg-secondary">{money(prev)}</td>}
                {percentOf !== undefined && <td className="py-2 pr-5 text-right type-body-sm text-fg-tertiary">{pct(line.amount)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
