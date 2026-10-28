'use client'

import { Check, Upload } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SummaryBox } from '../../components/ui/Form'
import { KeyValueRow } from '../../components/ui/KeyValueRow'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { NumberCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { useTrade } from '../../data/tradeContext'
import { cn } from '../../lib/cn'
import { formatNaira, formatNumber } from '../../lib/format'

const steps = [
  { title: 'Farm profile', detail: 'Name, logo, address for receipts' },
  { title: 'Pens & flocks', detail: '6 pens · 6 flocks with placement dates' },
  { title: 'Opening stock', detail: '5 feed types · 7 medications' },
  { title: 'Opening balances', detail: 'What customers and suppliers owe' },
  { title: 'Staff & roles', detail: '8 people to invite' },
  { title: 'Review & go live', detail: 'Check totals, then start' },
]
const DONE = 3

type Row = { id: string; name: string; opening: number; source: string; checked: boolean }

export default function GoLive() {
  const toast = useToast()
  const { customers, suppliers } = useTrade()
  const [step, setStep] = useState(DONE)
  const [side, setSide] = useState('Customers')
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())

  const customerRows: Row[] = customers
    .map((c) => ({ id: c.id, name: c.name, opening: c.opening, source: c.openingSource ?? '—', checked: c.opening === 0 || !!c.openingChecked || confirmed.has(c.id) }))
    .sort((a, b) => b.opening - a.opening)
  const supplierRows: Row[] = suppliers.map((s) => ({ id: s.id, name: s.name, opening: 0, source: '—', checked: true }))
  const tabs = [`Customers · ${customerRows.length}`, `Suppliers · ${supplierRows.length}`]
  const rows = side.startsWith('Customers') ? customerRows : supplierRows
  const pending = customerRows.filter((r) => !r.checked)
  const withBalance = customerRows.filter((r) => r.opening > 0)
  const total = customerRows.reduce((n, r) => n + r.opening, 0)

  const columns: Column<Row>[] = [
    { key: 'name', header: side.startsWith('Customers') ? 'Customer' : 'Supplier', render: (r) => <TextCell tone="primary">{r.name}</TextCell> },
    { key: 'opening', header: 'Opening balance', align: 'right', width: 150, render: (r) => <NumberCell>{formatNaira(r.opening)}</NumberCell> },
    { key: 'source', header: 'Source', width: 170, render: (r) => <TextCell>{r.source}</TextCell> },
    {
      key: 'check',
      header: 'Check',
      width: 120,
      render: (r) =>
        r.checked ? (
          <Badge dot tone="success">
            Checked
          </Badge>
        ) : (
          <button type="button" onClick={() => setConfirmed((s) => new Set(s).add(r.id))} className="cursor-pointer">
            <Badge dot tone="warning">
              Confirm
            </Badge>
          </button>
        ),
    },
  ]

  return (
    <>
      <PageHeader sample
        backTo="/settings"
        eyebrow={['Settings', 'Go-live setup']}
        title="Set up AyokaFarm"
        description="Done once, on go-live day. It carries the farm’s real starting numbers into the app, so day one is right (probe G15)."
        actions={<Button onClick={() => toast('Progress saved')}>Save and finish later</Button>}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="w-full shrink-0 lg:w-[300px] gap-1 p-5">
          <div className="flex items-baseline gap-2 pb-2">
            <h2 className="type-h3 text-fg-primary">Steps</h2>
            <span className="type-body-sm text-fg-tertiary">{DONE} of {steps.length} done</span>
          </div>
          <ol className="flex flex-col gap-1">
            {steps.map((s, i) => {
              const done = i < DONE
              const current = i === step
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    aria-current={current ? 'step' : undefined}
                    onClick={() => setStep(i)}
                    className={cn('flex w-full cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-left', current ? 'bg-brand-subtle' : 'hover:bg-canvas')}
                  >
                    <span
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-full type-label-sm',
                        done ? 'bg-brand text-fg-on-brand' : current ? 'border-[1.5px] border-line-brand text-fg-brand' : 'bg-subtle text-fg-tertiary',
                      )}
                    >
                      {done ? <Check size={16} strokeWidth={2} /> : i + 1}
                    </span>
                    <span className="flex flex-col">
                      <span className={cn('type-body-md', i > DONE ? 'text-fg-secondary' : 'text-fg-primary')}>{s.title}</span>
                      <span className="type-body-sm text-fg-tertiary">{s.detail}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </Card>

        {step === 3 ? (
          <Card className="min-w-0 flex-1 gap-4 p-5">
            <div className="flex items-baseline gap-2">
              <h2 className="type-h3 text-fg-primary">Opening balances</h2>
              <span className="type-body-sm text-fg-tertiary">As at Wed 01/07/2026</span>
            </div>
            <p className="type-body-md text-fg-secondary">
              Type what each party owed at close of business on 30 June, from the ledger book or WhatsApp records. This is the only balance anyone ever types; everything after it is calculated (BR-4).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl label="Party type" options={tabs} value={side.startsWith('Customers') ? tabs[0] : tabs[1]} onChange={setSide} />
              <span className="flex-1" />
              <Button leadingIcon={Upload} onClick={() => toast('Pick an Excel file with name and balance columns')}>
                Import from Excel
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              <Table columns={columns} rows={rows} rowKey={(r) => r.id} rowClassName={(r) => (!r.checked ? 'bg-accent-subtle' : undefined)} />
            </div>
            <SummaryBox>
              <KeyValueRow label="Customers with a balance">
                {withBalance.length} of {customerRows.length}
              </KeyValueRow>
              <KeyValueRow label="Still to confirm">{pending.length ? `${pending.length} (${pending.map((p) => p.name).join(', ')})` : 'None'}</KeyValueRow>
              <KeyValueRow label="Customers owe the farm" strong calculated>
                ₦ {formatNumber(total)}
              </KeyValueRow>
            </SummaryBox>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setStep(2)}>Back</Button>
              <Button variant="primary" disabled={pending.length > 0} onClick={() => setStep(4)}>
                {pending.length ? 'Confirm every balance to continue' : 'Next: Staff & roles'}
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="min-w-0 flex-1 items-center gap-2 p-12 text-center">
            <h2 className="type-h3 text-fg-primary">{steps[step].title}</h2>
            <p className="type-body-md text-fg-secondary">{step < DONE ? 'Done on 01 Jul 2026. Changes now happen in Settings.' : 'Finish opening balances first.'}</p>
          </Card>
        )}
      </div>
    </>
  )
}
