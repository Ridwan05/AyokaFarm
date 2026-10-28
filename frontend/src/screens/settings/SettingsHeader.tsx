import type { ReactNode } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { LinkTabs } from '../../components/ui/Tabs'
import { useCurrentUser } from '../../data/sessionContext'
import { canAccess } from '../../lib/access'

const tabs = [
  { label: 'Farm profile', to: '/settings' },
  { label: 'Staff', to: '/settings/staff' },
  { label: 'Roles & permissions', to: '/settings/roles' },
  { label: 'Feed & targets', to: '/settings/feed' },
  { label: 'Lists', to: '/settings/lists' },
  { label: 'Audit log', to: '/settings/audit' },
]

export function SettingsHeader({ title, description, actions, sample }: { title: string; description: string; actions?: ReactNode; sample?: boolean }) {
  const user = useCurrentUser()
  return (
    <>
      <PageHeader eyebrow="Settings" title={title} description={description} actions={actions} sample={sample} />
      <LinkTabs label="Settings" tabs={tabs.filter((t) => canAccess(t.to, user))} />
    </>
  )
}
