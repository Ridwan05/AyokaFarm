import { Egg, Users } from 'lucide-react'
import { SearchInput } from '../../components/ui/Form'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Select } from '../../components/ui/Select'
import { PERIODS, PRODUCT_FILTERS, type useSalesFilter } from './filters'

export function SalesFilterBar({ f }: { f: ReturnType<typeof useSalesFilter> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl label="Period" options={PERIODS} value={f.period} onChange={f.setPeriod} />
      <Select label="Product" leadingIcon={Egg} width={180} options={PRODUCT_FILTERS} value={f.product} onChange={f.setProduct} />
      <Select label="Customer" leadingIcon={Users} width={190} options={f.customerOptions} value={f.customer} onChange={f.setCustomer} />
      <span className="flex-1" />
      <SearchInput label="Search receipt or customer" placeholder="Search receipt or customer" value={f.query} onChange={(e) => f.setQuery(e.target.value)} />
    </div>
  )
}
