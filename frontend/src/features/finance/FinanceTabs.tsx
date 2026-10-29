import { RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { LinkTabs } from '../../components/ui/Tabs'

export function FinanceTabs() {
  return (
    <LinkTabs
      label="Finance"
      tabs={[
        { label: 'Fixed assets', to: '/finance' },
        { label: 'Capital & loans', to: '/finance/capital' },
        { label: 'Opening balances', to: '/finance/opening' },
      ]}
    />
  )
}

/** Loading or error placeholder while finance records load. */
export function FinanceState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Card className="items-center gap-3 p-10 text-center">
      {error ? (
        <>
          <p className="type-h3 text-fg-primary">Finance records couldn’t be loaded</p>
          <p className="max-w-[460px] type-body-md text-fg-secondary">{error}</p>
          <Button leadingIcon={RefreshCw} onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : (
        <p className="type-body-md text-fg-tertiary">Loading finance records…</p>
      )}
    </Card>
  )
}
