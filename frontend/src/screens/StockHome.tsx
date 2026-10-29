'use client'

import { ChevronRight, PackageCheck, Scale } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Card, CardHeader } from '../components/ui/Card'
import { feedTypes, medications, medicationStatus } from '../data/inventory'
import { farm } from '../data/session'
import { useCurrentUser } from '../data/sessionContext'
import { useTrade } from '../data/tradeContext'
import { formatLongDate, formatNumber, greeting } from '../lib/format'
import { farmSettings } from '../data/farmSettings'

/** Store Keeper's home: what's in the store, what's arriving, and the weekly count. */
export default function StockHome() {
  const user = useCurrentUser()
  const { orders, suppliers, stockOf } = useTrade()
  const feed = feedTypes.map((f) => {
    const bags = stockOf(f.name, f.bags)
    return { ...f, bags, daysOfCover: f.bagsPerDay ? Math.floor(bags / f.bagsPerDay) : null }
  })
  const meds = medications.map((m) => ({ ...m, stock: stockOf(m.name, m.stock) })).map((m) => ({ ...m, status: medicationStatus(m) }))
  const lowFeed = feed.filter((f) => f.daysOfCover !== null && f.daysOfCover <= farmSettings.lowStockDays).length
  const lowMeds = meds.filter((m) => m.status.tone === 'warning').length
  const low = lowFeed + lowMeds

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate(farm.today)}
        title={`${greeting(farm.today)}, ${user.name.split(' ')[0]}`}
        description={`${orders.length} ${orders.length === 1 ? 'delivery' : 'deliveries'} on the way · ${low} ${low === 1 ? 'item' : 'items'} low · weekly count due today`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickAction href="/deliveries" icon={<PackageCheck size={22} strokeWidth={1.5} />} title="Receive a delivery" detail={`${orders.length} waiting`} />
        <QuickAction href="/inventory/count" icon={<Scale size={22} strokeWidth={1.5} />} title="Weekly count" detail="Feed, eggs and medication" />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="type-h3 text-fg-primary">Feed in the store</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {feed.map((f) => {
            const inUse = f.daysOfCover !== null
            const low = inUse && f.daysOfCover! <= farmSettings.lowStockDays
            return (
              <Link key={f.name} href="/inventory/feed" className="flex flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong">
                <span className="type-label-md text-fg-secondary">{f.name}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="type-display-md text-fg-primary">{formatNumber(f.bags)}</span>
                  <span className="type-body-sm text-fg-tertiary">bags</span>
                </span>
                <Badge dot tone={!inUse ? 'neutral' : low ? 'warning' : 'success'}>
                  {inUse ? `${f.daysOfCover} days of cover` : 'Not in use'}
                </Badge>
              </Link>
            )
          })}
        </div>
      </section>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card className="min-w-0 flex-1">
          <CardHeader title="Medication" action={{ label: 'Open', to: '/inventory/medication' }} />
          <ul className="flex flex-col px-5 pb-3">
            {meds.map((m, i) => (
              <li key={m.name} className={`flex items-center gap-3 py-2.5 ${i < meds.length - 1 ? 'border-b border-line-subtle' : ''}`}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-label-md text-fg-primary">{m.name}</span>
                  <span className="type-body-sm text-fg-tertiary">
                    {formatNumber(m.stock)} {m.unit} · batch {m.batch} · exp {m.expiry}
                  </span>
                </span>
                <Badge tone={m.status.tone}>{m.status.label}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="w-full lg:w-[400px]">
          <CardHeader title="On the way" action={{ label: 'Deliveries', to: '/deliveries' }} />
          <ul className="flex flex-col px-5 pb-3">
            {orders.length === 0 && <li className="py-3 type-body-md text-fg-tertiary">Nothing waiting to be received.</li>}
            {orders.map((o) => (
              <li key={o.ref} className="flex flex-col border-b border-line-subtle py-2.5 last:border-0">
                <span className="type-label-md text-fg-primary">
                  {o.qty} {o.unit} {o.item}
                </span>
                <span className="type-body-sm text-fg-tertiary">
                  {suppliers.find((s) => s.id === o.supplierId)?.name ?? o.supplierId} · {o.ref} · ordered {o.ordered}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}

function QuickAction({ href, icon, title, detail }: { href: string; icon: ReactNode; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-[border-color,transform] duration-(--dur-press) ease-out hover:border-line-strong motion-safe:active:scale-[0.98]"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-icon-brand">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-label-lg text-fg-primary">{title}</span>
        <span className="type-body-sm text-fg-tertiary">{detail}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.5} className="text-icon-secondary" />
    </Link>
  )
}
