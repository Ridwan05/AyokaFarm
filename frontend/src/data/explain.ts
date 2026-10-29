import { farmSettings as s } from './farmSettings'

// How each figure is worked out, in plain words, for the info icons beside calculated values.
// Functions (not constants) so thresholds read from Settings stay current. One or two sentences:
// the formula in words, then what's included.

export const explain = {
  // ── Production ──
  liveBirds: () => 'The closing count from each flock’s latest daily entry (birds placed, less every death recorded). Pens with no entry yet use the birds placed.',
  layingRate: () => 'Eggs collected ÷ hens at the start of the day, in layer pens only. Pens without an entry for the day are left out.',
  mortality: () => `Birds that died ÷ birds at the start of the day. Above ${s.mortalityAlertPct}% in a pen raises an alert (set in Settings).`,
  diedToday: () => `Deaths recorded in today’s entry. Shown in red when they are more than ${s.mortalityAlertPct}% of the pen’s birds.`,
  feedVsExpected: () => `Feed used (bags × kg a bag) compared with the expected amount: birds × grams a bird a day for the flock’s age (Settings → Feed & targets). More than ±${s.feedVariancePct}% is flagged.`,
  expectedFeed: () => 'Grams a bird a day from the feed band for this flock’s age and breed (Settings → Feed & targets), × the birds in the pen.',
  flockAge: () => 'Days since the flock was placed, plus its age when it arrived.',
  flockWeek: () => 'Week of age: days since hatch ÷ 7, counting the first week as week 1.',
  typicalMortality: () => 'The range most days fall in for this flock over the last 30 days (up to the 80th percentile).',
  entriesRecorded: () => `Pens with a flock that have today’s entry saved. Entries are due by ${s.missingEntryCutoff}.`,
  missingEntries: () => 'Days a flock was in a pen with no daily entry saved. Late = saved after the day it was for.',
  cratesCollected: () => `Eggs collected ÷ ${s.eggsPerCrate} eggs a crate; loose eggs are what’s left over.`,

  // ── Stock ──
  daysOfCover: () => `Bags in store ÷ average bags used a day over the last 7 days, rounded down. ${s.lowStockDays} days or fewer counts as low (Settings).`,
  bagsPerDay: () => 'Bags taken out of store by daily entries over the last 7 days ÷ 7.',
  stockOnHand: () => 'Opening stock + deliveries received − amounts used in daily entries ± stock counts and write-offs.',
  reorderSuggestion: () => 'Enough for about two weeks at the current daily use, less what’s in store, rounded up to the next 10 bags (and at least back to the reorder level).',
  eggsInStore: () => `Eggs collected − eggs sold − broken or counted out, shown in crates of ${s.eggsPerCrate}.`,
  eggsHeld: () => 'Eggs from pens still in a medication withdrawal period. They can’t be sold until the pen is clear.',
  medicationOnHand: () => 'Opening stock + batches received − doses given in daily entries ± counts and write-offs.',
  openingMedication: () => 'Stock entered at go-live, which isn’t tied to a delivered batch.',
  medicationStatus: () => `Reorder when stock is at or below the reorder level; near reorder within 25% above it. Batches expiring within ${s.expiryWarningDays} days are flagged.`,
  withdrawal: () => 'Last dose date + the medication’s withdrawal days. Eggs and birds from the pen can be sold from the day after.',
  lastCount: () => 'Days since the last stock count was saved (a “Recount” adjustment).',

  // ── Money ──
  customerBalance: () => 'Opening balance + approved sales − what was paid at each sale − later payments. Payments clear the oldest unpaid sale first.',
  supplierBalance: () => 'Opening balance + purchases + unpaid expenses booked to the supplier − what was paid at the time − later payments. Negative means they hold credit for us.',
  ageing: () => `Unpaid amounts grouped by how many days old each unpaid sale (or opening balance) is. Over ${s.overdueDebtDays} days is overdue (Settings).`,
  overdue: () => `The part of the balance from sales more than ${s.overdueDebtDays} days old that hasn’t been paid yet.`,
  pastTerms: () => 'Unpaid purchases older than the supplier’s payment terms (days to pay after delivery).',
  daysToPay: () => 'Average days between a sale and the payment that cleared it, matching payments to the oldest unpaid sale first.',
  penPortion: () => 'This pen’s quantity × the sale price. It counts as this pen’s sales in Costs & profit and the P&L.',
  saleTotal: () => 'Quantity × price for each unit.',
  leftOnSale: () => 'Sale total − what was paid on it, at the time and since.',
  newBalance: () => 'Balance now, plus this sale or purchase, less what’s paid now.',
  afterPayment: () => 'Balance now − this payment. It clears the oldest unpaid bills first.',
  allocation: () => 'The payment is applied to unpaid bills from the oldest first, until it runs out.',
  periodTotal: () => 'Added up from the records in the selected period.',
  change: (vs: string) => `Compared with ${vs}.`,

  // ── Pen costs and profit ──
  penRevenue: () => 'This pen’s portions of sales (its quantity × the sale price), plus a share of sales not split by pen, in proportion to the eggs this pen collected.',
  feedCost: () => 'Bags used in daily entries × the average price paid a bag for that feed (from purchases).',
  medicationCost: () => 'Each dose given × the cost a unit of the batch it came from (purchase price ÷ units bought).',
  birdCost: () => 'Bird purchases for this pen’s flock in the period.',
  penExpenses: () => 'Expenses recorded against this pen.',
  overheadShare: () => 'General farm expenses (not tied to a pen) shared between pens by bird-days: birds in the pen × days in the period.',
  margin: () => 'Revenue − feed − medication − birds − pen expenses − share of farm costs.',
  costPerCrate: () => `All costs for layer pens ÷ crates collected (eggs ÷ ${s.eggsPerCrate}).`,
  feedPerCrate: () => 'Kg of feed used ÷ crates collected.',
  avgSellingPrice: () => 'Money from egg sales ÷ crates sold in the period.',
  costPerBirdDay: () => 'Total costs ÷ bird-days (birds in the pen added up over each day).',
  feedPerBirdDay: () => 'Grams of feed used ÷ bird-days.',
  feedCostPerBird: () => 'Feed cost ÷ the average number of birds over the period.',
  weightedFeedCost: () => 'Total paid for a feed ÷ bags bought, so bigger purchases count for more.',
  feedUsedCost: () => 'Bags used × the weighted average cost a bag.',
  sharedByBirdDays: () => 'General expenses are split between pens by their share of birds × days.',
}
