import { Download, Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { LinkTabs } from '../../components/ui/Tabs'
import { useCurrentUser } from '../../data/sessionContext'
import { accessOf } from '../../lib/access'

const tabs = [
  { label: 'Profit & loss', to: '/reports' },
  { label: 'Daily production', to: '/reports/production' },
  { label: 'Feed ledger', to: '/reports/feed' },
  { label: 'Medication ledger', to: '/reports/medication' },
  { label: 'Statements', to: '/reports/statements' },
]

/** Financial statements, for roles with finance access (owner and accounts). */
const financeTabs = [
  { label: 'Income statement', to: '/reports/income' },
  { label: 'Balance sheet', to: '/reports/balance-sheet' },
]

/**
 * Shared header + tabs for every report. Excel downloads the report's main table as CSV;
 * PDF opens the browser's print dialog, where "Save as PDF" makes the file.
 */
export function ReportHeader({ title, description, actions, onExport }: { title: string; description: string; actions?: ReactNode; onExport?: () => void }) {
  const user = useCurrentUser()
  const shown = accessOf(user, 'finance') === 'none' ? tabs : [...tabs, ...financeTabs]
  return (
    <>
      <PageHeader
        eyebrow={['Insight', 'Reports']}
        title={title}
        description={description}
        actions={
          actions ?? (
            <>
              {onExport && (
                <Button leadingIcon={Download} onClick={onExport}>
                  Excel
                </Button>
              )}
              <Button variant="primary" leadingIcon={Printer} onClick={() => window.print()}>
                PDF
              </Button>
            </>
          )
        }
      />
      <LinkTabs label="Reports" tabs={shown} />
    </>
  )
}
