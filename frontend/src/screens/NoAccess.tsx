'use client'

import { Lock, MessageCircle } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useToast } from '../components/ui/toastContext'
import { roles } from '../data/settings'
import { useCurrentUser } from '../data/sessionContext'
import { describeArea } from '../lib/access'

const sees: Record<string, string> = {
  owner: 'everything',
  'farm-manager': 'pens, production, stock, sales and purchases',
  'sales-accounts': 'sales, payments, customers, suppliers and reports',
  'store-keeper': 'feed, egg and medication stock, and deliveries',
  'pen-attendant': 'your own pens, their daily entries and expenses, and stock levels',
  'pen-attendant-all': 'every pen, its daily entries and expenses, and stock levels',
}

/** P-E15 · shown when someone opens a page outside their role (e.g. from a shared link). */
export default function NoAccess() {
  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const user = useCurrentUser()
  const area = describeArea(pathname)
  const roleName = roles.find((r) => r.id === user.role)?.name ?? user.roleLabel

  return (
    <>
      <PageHeader eyebrow={area.group ? [area.group, area.label] : undefined} title={area.label} description="Opened from a link shared on WhatsApp." />
      <Card className="min-h-[560px] items-center justify-center gap-4 p-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-subtle text-icon-secondary">
          <Lock size={22} strokeWidth={1.5} />
        </span>
        <h2 className="type-display-md text-fg-primary">{area.label} isn’t part of your role</h2>
        <p className="max-w-[540px] type-body-md text-fg-secondary">
          As {roleName} you see {sees[user.role]}. If you need {area.label.toLowerCase()}, ask Adeola — the owner can change what your role sees in Settings.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={() => router.push('/')}>
            Back to home
          </Button>
          <Button leadingIcon={MessageCircle} onClick={() => toast('Request sent to Adeola on WhatsApp')}>
            Ask Adeola for access
          </Button>
        </div>
      </Card>
    </>
  )
}
