import { Plus, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { SelectInput, TextInput } from '../../components/ui/Form'
import { InfoTip } from '../../components/ui/InfoTip'
import { num, type PenChoice, type PortionRow } from './portionRules'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'

type Props = {
  choices: PenChoice[]
  rows: PortionRow[]
  onChange: (rows: PortionRow[]) => void
  /** The sale quantity the portions must add up to. */
  total: number
  /** Plural unit, e.g. "crates", "birds". */
  unit: string
  showErrors?: boolean
}

/** Rows of [pen] [quantity] with a running "25 of 40 crates given to pens" line. */
export function PenPortions({ choices, rows, onChange, total, unit, showErrors }: Props) {
  const given = rows.reduce((n, r) => n + num(r.qty), 0)
  const left = total - given
  const unused = choices.filter((c) => !rows.some((r) => r.penId === c.penId))
  const set = (i: number, row: Partial<PortionRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...row } : r)))

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => {
        const choice = choices.find((c) => c.penId === row.penId)
        const tooMany = choice?.birds !== null && choice?.birds !== undefined && num(row.qty) > choice.birds
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_112px_32px] items-center gap-2">
            <SelectInput
              aria-label={`Pen ${i + 1}`}
              size="md"
              value={String(row.penId)}
              onChange={(e) => set(i, { penId: Number(e.target.value) })}
              options={[...(choice ? [choice] : []), ...unused].map((c) => ({
                value: String(c.penId),
                label: c.birds !== null ? `${c.name} · ${formatNumber(c.birds)} birds` : c.name,
              }))}
            />
            <TextInput
              aria-label={`Quantity from pen ${i + 1}`}
              size="md"
              inputMode="decimal"
              value={row.qty}
              invalid={(showErrors && num(row.qty) <= 0) || tooMany}
              onChange={(e) => set(i, { qty: e.target.value })}
            />
            <button
              type="button"
              aria-label="Remove this pen"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-icon-secondary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94]"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {unused.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={Plus}
            // Start the new row with whatever is still to be given out.
            onClick={() => onChange([...rows, { penId: unused[0].penId, qty: left > 0 ? formatNumber(left) : '' }])}
          >
            Add pen
          </Button>
        )}
        <span className={cn('inline-flex items-center gap-1.5 type-body-sm', left === 0 ? 'text-fg-tertiary' : showErrors ? 'text-fg-danger' : 'text-fg-warning')}>
          {formatNumber(given)} of {formatNumber(total)} {unit} given to pens
          {left !== 0 && ` · ${left > 0 ? `${formatNumber(left)} left` : `${formatNumber(-left)} too many`}`}
          <InfoTip label="Pen portions">
            Each pen’s quantity × the sale price counts as that pen’s sales. The portions must add up to the quantity sold; birds also come off each pen’s
            flock count.
          </InfoTip>
        </span>
      </div>
      {choices.length === 0 && <p className="type-body-sm text-fg-danger">No pen has a flock this can come from.</p>}
    </div>
  )
}
