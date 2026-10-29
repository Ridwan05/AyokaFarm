import { Plus, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { SelectInput, TextInput } from '../../components/ui/Form'
import { InfoTip } from '../../components/ui/InfoTip'
import { formatNumber } from '../../lib/format'
import { sourceTotals, type BatchChoice, type SourceRow } from './birdSourceRules'

type Props = {
  choices: BatchChoice[]
  rows: SourceRow[]
  onChange: (rows: SourceRow[]) => void
  /** Owner only: birds that weren't bought (go-live flock, own hatch). */
  allowNoPurchase: boolean
  showErrors?: boolean
}

const removeButton =
  'inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-icon-secondary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94]'

/** Rows of [bird stock batch] [birds], plus owner rows for birds not from a purchase. */
export function BirdSources({ choices, rows, onChange, allowNoPurchase, showErrors }: Props) {
  const totals = sourceTotals(rows, choices)
  const used = new Set(rows.flatMap((r) => (r.kind === 'stock' ? [r.purchaseId] : [])))
  const unused = choices.filter((c) => !used.has(c.purchaseId))
  const set = (i: number, row: SourceRow) => onChange(rows.map((r, j) => (j === i ? row : r)))
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i))

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) =>
        row.kind === 'stock' ? (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_104px_32px] items-center gap-2">
            <SelectInput
              aria-label={`Batch ${i + 1}`}
              size="md"
              value={String(row.purchaseId)}
              onChange={(e) => set(i, { ...row, purchaseId: Number(e.target.value) })}
              options={choices
                .filter((c) => c.purchaseId === row.purchaseId || !used.has(c.purchaseId))
                .map((c) => ({ value: String(c.purchaseId), label: c.label }))}
            />
            <TextInput
              aria-label={`Birds from batch ${i + 1}`}
              size="md"
              inputMode="numeric"
              value={row.birds}
              invalid={showErrors && !(Number(row.birds.replace(/,/g, '')) > 0)}
              onChange={(e) => set(i, { ...row, birds: e.target.value })}
            />
            <button type="button" aria-label="Remove this batch" onClick={() => remove(i)} className={removeButton}>
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_104px_32px] items-center gap-2">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_112px] items-center gap-2">
              <span className="truncate type-body-md text-fg-secondary">Not from a purchase</span>
              <TextInput aria-label="Cost a bird (optional)" size="md" prefix="₦" inputMode="numeric" placeholder="Cost" value={row.cost} onChange={(e) => set(i, { ...row, cost: e.target.value })} />
            </div>
            <TextInput
              aria-label="Birds not from a purchase"
              size="md"
              inputMode="numeric"
              value={row.birds}
              invalid={showErrors && !(Number(row.birds.replace(/,/g, '')) > 0)}
              onChange={(e) => set(i, { ...row, birds: e.target.value })}
            />
            <button type="button" aria-label="Remove these birds" onClick={() => remove(i)} className={removeButton}>
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        ),
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {unused.length > 0 && (
          <Button size="sm" variant="ghost" leadingIcon={Plus} onClick={() => onChange([...rows, { kind: 'stock', purchaseId: unused[0].purchaseId, birds: formatNumber(unused[0].left) }])}>
            Add batch
          </Button>
        )}
        {allowNoPurchase && (
          <Button size="sm" variant="ghost" leadingIcon={Plus} onClick={() => onChange([...rows, { kind: 'none', birds: '', cost: '' }])}>
            Birds not from a purchase
          </Button>
        )}
        <span className="inline-flex items-center gap-1.5 type-body-sm text-fg-tertiary">
          {formatNumber(totals.birds)} birds · ₦{formatNumber(Math.round(totals.cost))}
          <InfoTip label="Cost of birds placed">
            Birds from each batch × its cost a bird (the purchase price ÷ birds received). Birds not from a purchase use the cost typed, or nothing.
          </InfoTip>
        </span>
      </div>
    </div>
  )
}
