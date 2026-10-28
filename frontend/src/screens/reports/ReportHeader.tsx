import { Download, Share2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { LinkTabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/toastContext'

const tabs = [
  { label: 'Profit & loss', to: '/reports' },
  { label: 'Daily production', to: '/reports/production' },
  { label: 'Feed ledger', to: '/reports/feed' },
  { label: 'Medication ledger', to: '/reports/medication' },
  { label: 'Statements', to: '/reports/statements' },
]

/** Shared header + tabs for every report. */
export function ReportHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  const toast = useToast()
  return (
    <>
      <PageHeader
        eyebrow={['Insight', 'Reports']}
        title={title}
        description={description}
        actions={
          actions ?? (
            <>
              <Button leadingIcon={Download} onClick={() => toast(`${title} exported to Excel`)}>
                Excel
              </Button>
              <Button variant="primary" leadingIcon={Share2} onClick={() => toast(`${title} PDF ready to share`)}>
                Share PDF
              </Button>
            </>
          )
        }
      />
      <LinkTabs label="Reports" tabs={tabs} />
    </>
  )
}
