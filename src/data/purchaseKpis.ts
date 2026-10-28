import type { Kpi } from '../components/ui/KpiCard'
import type { PurchaseKind } from './purchases'

const flat = [1, 1, 1, 1, 1, 1, 1]
const rising = [84.9, 85.0, 84.9, 85.0, 85.0, 85.1, 85.6, 86.4]

export const purchaseKpis: Record<PurchaseKind | 'All', Kpi[]> = {
  All: [
    { label: 'Bought this month', value: '3.11', unit: 'million ₦', delta: '+4%', trend: 'flat', sentiment: 'neutral', context: 'vs September', info: 'Feed, birds and medication bought in October', spark: flat },
    { label: 'Feed bought', value: '3.02', unit: 'million ₦', delta: '160 bags', trend: 'flat', sentiment: 'neutral', context: 'avg ₦18,875 a bag', info: 'Feed bought in October', spark: flat },
    { label: 'Owed to suppliers', value: '455', unit: 'thousand ₦', delta: '3 suppliers', trend: 'flat', sentiment: 'neutral', context: 'nothing overdue', info: 'Unpaid purchases, all suppliers', spark: flat },
    { label: 'Layer mash price', value: '18,500', unit: '₦ a bag', delta: '+2.8%', trend: 'up', sentiment: 'bad', context: 'vs ₦18,000 in Sept', info: 'Last price paid for layer mash', spark: rising },
  ],
  Feed: [
    { label: 'Feed bought this month', value: '3.02', unit: 'million ₦', delta: '160 bags', trend: 'flat', sentiment: 'neutral', context: 'PF-0412 and PF-0418', info: 'Feed bought in October', spark: flat },
    { label: 'Bags this month', value: '160', unit: 'bags', delta: 'Layer mash 100', trend: 'flat', sentiment: 'neutral', context: 'Broiler starter 60', info: 'Bags of feed bought in October', spark: flat },
    { label: 'Owed for feed', value: '300', unit: 'thousand ₦', delta: 'Greenfield Feeds', trend: 'flat', sentiment: 'neutral', context: 'Sunshine holds ₦20,000 credit', info: 'Unpaid feed purchases', spark: flat },
    { label: 'Layer mash price', value: '18,500', unit: '₦ a bag', delta: '+2.8%', trend: 'up', sentiment: 'bad', context: 'vs ₦18,000 in Sept', info: 'Last price paid for layer mash', spark: rising },
  ],
  Birds: [
    { label: 'Birds bought this month', value: '0', unit: 'birds', delta: 'None in October', trend: 'flat', sentiment: 'neutral', context: 'next flock: 20 Nov', info: 'Birds bought in October', spark: flat },
    { label: 'Bought since September', value: '3,300', unit: 'day-old broilers', delta: '2 batches', trend: 'flat', sentiment: 'neutral', context: 'Oyo Hatcheries', info: 'Birds bought since 1 September', spark: flat },
    { label: 'Owed for birds', value: '70', unit: 'thousand ₦', delta: 'Oyo Hatcheries', trend: 'flat', sentiment: 'neutral', context: 'rest of PB-0031', info: 'Unpaid bird purchases', spark: flat },
    { label: 'Price a chick', value: '850', unit: '₦ a bird', delta: 'Same as Sept', trend: 'up', sentiment: 'bad', context: 'PB-0030 and PB-0031', info: 'Last price paid for a day-old chick', spark: rising },
  ],
  Medication: [
    { label: 'Medication bought this month', value: '85', unit: 'thousand ₦', delta: '1 order', trend: 'flat', sentiment: 'neutral', context: 'PM-0112 · Amoxicillin', info: 'Medication bought in October', spark: flat },
    { label: 'Bought since August', value: '173', unit: 'thousand ₦', delta: '4 orders', trend: 'flat', sentiment: 'neutral', context: 'VetCare Pharma Ltd', info: 'Medication bought since 1 August', spark: flat },
    { label: 'Owed for medication', value: '85', unit: 'thousand ₦', delta: 'VetCare Pharma Ltd', trend: 'flat', sentiment: 'neutral', context: 'on credit since 02 Oct', info: 'Unpaid medication purchases', spark: flat },
    { label: 'Expiring in 60 days', value: '1', unit: 'batch', delta: 'Gumboro GB-1003', trend: 'up', sentiment: 'bad', context: 'expires 03 Dec', info: 'Medication batches expiring in the next 60 days', spark: rising },
  ],
}
