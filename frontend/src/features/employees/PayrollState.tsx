import { RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

/** Shown while payroll loads, or if it can't be loaded (e.g. payroll isn't set up in the database yet). */
export function PayrollState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Card className="items-center gap-3 p-10 text-center">
      {error ? (
        <>
          <p className="type-label-md text-fg-primary">Payroll couldn’t be loaded</p>
          <p className="max-w-[460px] type-body-sm text-fg-secondary">{error}</p>
          <Button size="sm" leadingIcon={RefreshCw} onClick={onRetry}>
            Try again
          </Button>
        </>
      ) : (
        <p className="type-body-md text-fg-tertiary">Loading payroll…</p>
      )}
    </Card>
  )
}
