'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { KpiCard } from '../../components/ui/KpiCard'
import { RowMenu } from '../../components/ui/Menu'
import { Presence } from '../../components/ui/Overlay'
import { NumberCell, PrimaryCell, Table, TextCell, type Column } from '../../components/ui/Table'
import { useToast } from '../../components/ui/toastContext'
import { bookValue, depreciation, useFinance, type FixedAsset } from '../../data/finance'
import { dayMonth, kpi, nairaKpi, num, todayISO } from '../../data/metrics'
import { useCurrentUser } from '../../data/sessionContext'
import { AssetModal, DisposeModal } from '../../features/finance/AssetModal'
import { CATEGORY_LABEL, lifeLabel } from '../../features/finance/financeView'
import { FinanceState, FinanceTabs } from '../../features/finance/FinanceTabs'
import { accessOf, can } from '../../lib/access'
import { downloadCsv } from '../../lib/export'
import { formatNaira } from '../../lib/format'

// Finance → Fixed assets: what the farm owns for the long run, depreciated straight-line. Feeds the
// Balance Sheet (book value) and the Income Statement (depreciation).

const FLAT = [0, 0]
const year = (iso: string) => iso.slice(0, 4)

type Row = { asset: FixedAsset; deprec: number; book: number; status: 'In use' | 'Disposed' | 'Fully depreciated' }

export default function FixedAssets() {
  const user = useCurrentUser()
  const toast = useToast()
  const { data, loaded, error, reload, save } = useFinance()
  const [editing, setEditing] = useState<FixedAsset | 'new' | null>(null)
  const [disposing, setDisposing] = useState<FixedAsset | null>(null)
  const today = todayISO()
  const canAdd = can(user, 'finance', 'add')
  const canEdit = can(user, 'finance', 'edit')
  const canDelete = accessOf(user, 'finance', 'delete') === 'all'

  const rows: Row[] = data.assets.map((a) => {
    const deprec = depreciation(a, a.acquired_on, a.disposed_on ?? today)
    const book = bookValue(a, today)
    const status = a.disposed_on && a.disposed_on <= today ? 'Disposed' : a.useful_life_months && book <= Number(a.salvage_value) + 0.5 ? 'Fully depreciated' : 'In use'
    return { asset: a, deprec, book, status }
  })
  const held = rows.filter((r) => r.status !== 'Disposed')
  const totalCost = held.reduce((n, r) => n + Number(r.asset.cost), 0)
  const totalDeprec = held.reduce((n, r) => n + r.deprec, 0)
  const totalBook = held.reduce((n, r) => n + r.book, 0)
  const thisYear = data.assets.reduce((n, a) => n + depreciation(a, `${year(today)}-01-01`, today), 0)

  const kpis = [
    kpi({ label: 'Cost of assets held', ...nairaKpi(totalCost), current: null, previous: null, context: `${num(held.length)} assets`, info: 'What the assets still owned cost when bought or brought in, added up. Disposed assets are left out.', spark: FLAT }),
    kpi({
      label: 'Depreciation to date',
      ...nairaKpi(totalDeprec),
      current: null,
      previous: null,
      context: `${formatNaira(Math.round(thisYear))} this year`,
      info: 'For each asset: (cost − value at the end of its life) ÷ useful life, for each day it has been owned. Land isn’t depreciated.',
      spark: FLAT,
    }),
    kpi({ label: 'Book value', ...nairaKpi(totalBook), current: null, previous: null, context: 'On the Balance Sheet today', info: 'Cost − depreciation to date, for assets still owned. This is the figure on the Balance Sheet.', spark: FLAT }),
  ]

  const tone = { 'In use': 'success', Disposed: 'neutral', 'Fully depreciated': 'warning' } as const
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Asset',
      render: (r) => <PrimaryCell initials={r.asset.name.slice(0, 2).toUpperCase()} title={r.asset.name} subtitle={CATEGORY_LABEL[r.asset.category]} />,
    },
    { key: 'acquired', header: 'Acquired', width: 112, render: (r) => <TextCell>{`${dayMonth(r.asset.acquired_on)} ${year(r.asset.acquired_on)}`}</TextCell> },
    { key: 'cost', header: 'Cost', align: 'right', width: 128, render: (r) => <NumberCell>{formatNaira(Number(r.asset.cost))}</NumberCell> },
    { key: 'life', header: 'Life', width: 96, render: (r) => <TextCell>{lifeLabel(r.asset.useful_life_months)}</TextCell> },
    { key: 'dep', header: 'Depreciation', align: 'right', width: 128, render: (r) => <NumberCell>{formatNaira(Math.round(r.deprec))}</NumberCell> },
    { key: 'book', header: 'Book value', align: 'right', width: 128, render: (r) => <NumberCell>{r.status === 'Disposed' ? '—' : formatNaira(Math.round(r.book))}</NumberCell> },
    { key: 'status', header: 'Status', width: 140, render: (r) => <Badge tone={tone[r.status]}>{r.status}</Badge> },
  ]

  const exportRows = () =>
    downloadCsv(
      'fixed-assets',
      ['Asset', 'Kind', 'Acquired', 'Cost', 'Useful life (months)', 'End value', 'Paid from', 'Depreciation to date', 'Book value', 'Disposed on', 'Disposal amount'],
      rows.map((r) => [r.asset.name, CATEGORY_LABEL[r.asset.category], r.asset.acquired_on, Number(r.asset.cost), r.asset.useful_life_months, Number(r.asset.salvage_value), r.asset.paid_from ?? 'already owned', Math.round(r.deprec), Math.round(r.book), r.asset.disposed_on, r.asset.disposal_amount]),
    )

  const remove = async (a: FixedAsset) => {
    if (!window.confirm(`Delete ${a.name}? Use Dispose instead if it was sold or scrapped.`)) return
    if (await save((db) => db.from('fixed_assets').delete().eq('id', a.id))) toast(`${a.name} deleted`)
  }

  return (
    <>
      <PageHeader
        eyebrow={['Insight', 'Finance']}
        title="Fixed assets"
        description="Land, poultry houses, equipment, machinery and vehicles. Their book value is on the Balance Sheet; depreciation is a cost on the Income Statement."
        actions={
          canAdd ? (
            <Button variant="primary" leadingIcon={Plus} onClick={() => setEditing('new')}>
              Add asset
            </Button>
          ) : undefined
        }
      />
      <FinanceTabs />
      {!loaded ? (
        <FinanceState error={error} onRetry={() => void reload()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-4">
            {kpis.map((k) => (
              <KpiCard key={k.label} kpi={k} />
            ))}
          </div>
          <Card>
            <CardHeader
              title="Register"
              meta={<span className="type-body-sm text-fg-tertiary">{num(rows.length)} assets</span>}
              action={rows.length ? { label: 'Export', onClick: exportRows } : undefined}
            />
            {rows.length ? (
              <Table
                columns={columns}
                rows={rows}
                rowKey={(r) => String(r.asset.id)}
                onRowClick={canEdit ? (r) => setEditing(r.asset) : undefined}
                rowActions={
                  canEdit
                    ? (r) => (
                        <RowMenu
                          items={[
                            { label: 'Edit…', onSelect: () => setEditing(r.asset) },
                            ...(r.status !== 'Disposed' ? [{ label: 'Dispose of…', onSelect: () => setDisposing(r.asset) }] : []),
                            ...(canDelete ? [{ label: 'Delete', danger: true, onSelect: () => void remove(r.asset) }] : []),
                          ]}
                        />
                      )
                    : undefined
                }
              />
            ) : (
              <p className="px-5 pb-5 type-body-md text-fg-tertiary">
                No fixed assets yet. Add the land, pens, equipment, generators and vehicles the farm owns — including those owned before go-live — so the Balance Sheet shows them.
              </p>
            )}
          </Card>
        </>
      )}
      <Presence>{editing && <AssetModal asset={editing === 'new' ? undefined : editing} save={save} onClose={() => setEditing(null)} />}</Presence>
      <Presence>{disposing && <DisposeModal asset={disposing} save={save} onClose={() => setDisposing(null)} />}</Presence>
    </>
  )
}
