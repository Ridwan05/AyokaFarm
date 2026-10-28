import { LinkTabs } from '../../components/ui/Tabs'

export function InventoryTabs() {
  return (
    <LinkTabs
      label="Inventory"
      tabs={[
        { label: 'Feed', to: '/inventory/feed' },
        { label: 'Medication', to: '/inventory/medication' },
        { label: 'Eggs', to: '/inventory/eggs' },
      ]}
    />
  )
}

/** Ledger footnote shown under each stock table. */
export function LedgerNote({ children }: { children: string }) {
  return <p className="rounded-b-xl bg-canvas px-5 py-3 type-body-sm text-fg-secondary">{children}</p>
}
