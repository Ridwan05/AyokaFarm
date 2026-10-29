import { explain } from './explain'
import { farmSettings as s } from './farmSettings'

// How the money figures are worked out, for the info icons on sales, purchases, payments,
// customers, suppliers, expenses and deliveries. General wording lives in explain.ts.

const week = 'Monday to today, compared with the same days last week.'
const month = 'From the 1st of this month to today, compared with the same days last month.'

export const explainMoney = {
  // ── Sales ──
  salesThisWeek: () => `Quantity × price for every approved sale (sales waiting for approval are left out). ${week}`,
  eggsSold: () => `Crates of whole and cracked eggs on approved sales. ${week}`,
  soldOnCredit: () => `Each approved sale’s total − what was paid at the time of sale. ${week}`,
  collectedWeek: () => `Money paid at the time of sale + payments received from customers afterwards. ${week}`,
  soldToday: () => 'Quantity × price for today’s approved sales, compared with yesterday. Sales waiting for approval are shown separately.',
  collectedToday: () => 'What customers paid at the time of today’s approved sales, compared with yesterday. Later payments aren’t included.',
  salesListTotal: () => 'Quantity × price added up for the sales in this list (with the filters applied).',
  todaysSales: () => 'Quantity × price for each of today’s sales, including those waiting for approval.',

  // ── Purchases ──
  boughtThisMonth: (what: string) => `Quantity × price for every purchase of ${what}. ${month}`,
  bagsBought: () => `Bags on feed purchases, added up. ${month}`,
  birdsBought: () => `Birds on bird purchases, added up. ${month}`,
  birds90: () => 'Birds on bird purchases dated in the last 90 days, added up.',
  medication90: () => 'Quantity × price for medication purchases dated in the last 90 days.',
  lastPrice: (what: string) => `Price a unit on the latest purchase of ${what}, compared with the last different price paid for the same item.`,
  owedFor: (kind?: string) => `What’s still unpaid on ${kind ? `${kind} ` : ''}purchases: each purchase total − paid at the time − later payments to the supplier, which clear the oldest purchase first.`,
  expiringBatches: () => `Medication batches with stock left whose expiry date is within ${s.expiryWarningDays} days (Settings).`,
  purchasesListTotal: () => 'Quantity × price added up for the purchases in this list (with the filters applied).',
  purchaseTotal: () => 'Quantity × price a unit.',
  purchasePaid: () => 'Paid at the time of purchase + later payments to the supplier, which clear the oldest purchase first.',
  leftToPay: () => 'Purchase total − what’s been paid on it so far. A negative amount means it was overpaid.',

  // ── Payments ──
  receivedWeek: () => `Payments recorded from customers (money paid at the time of a sale isn’t included). ${week}`,
  byTransfer: () => 'Transfers ÷ all payments received from customers this week (Monday to today). Cash and POS make up the rest.',
  paidToSuppliers: () => `Payments recorded to suppliers. ${week}`,

  // ── Customers ──
  owedToFarm: () => `Every customer’s balance that’s above zero, added up. ${explain.customerBalance()}`,
  owedToFarmNet: () => `Every customer’s balance added up (a customer in credit reduces it). ${explain.customerBalance()}`,
  overdueCustomers: () => `Unpaid amounts on sales (and opening balances) more than ${s.overdueDebtDays} days old, after payments clear the oldest first.`,
  avgDaysToPay: () => 'For credit sales fully paid in the last 90 days: average days from the sale to the payment that cleared it (oldest sale cleared first). Compared with the 90 days before.',
  paidWithin30: () => 'Credit sales from the last 90 days that are at least 30 days old: the share paid off within 30 days. Compared with the 90 days before.',
  lastPayment: () => 'The latest payment from this customer, or the latest sale paid at the time if that’s more recent.',
  sinceGoLiveSales: () => 'Every approved sale to this customer since go-live, added up (opening balance not included).',
  sinceGoLivePaid: () => 'Paid at the time of sale + later payments from this customer since go-live.',
  oldestUnpaid: () => 'Days since the oldest sale (or opening balance) that still has something unpaid.',
  closingBalance: () => 'The opening balance plus every charge, less every payment on this statement, line by line.',

  // ── Suppliers ──
  owedToSuppliers: () => `Every supplier balance that’s above zero, added up. ${explain.supplierBalance()}`,
  supplierCredit: () => 'Suppliers with a negative balance (we’ve paid more than they’ve billed), added up.',
  activeSuppliers: () => 'Suppliers with a purchase or an expense booked to them in the last 90 days.',
  supplierDue: () => 'The oldest unpaid bill’s date + the supplier’s payment terms (days). Overdue once that date has passed.',
  sinceGoLiveBought: () => 'Every purchase and expense billed by this supplier since go-live, added up (opening balance not included).',
  sinceGoLiveSupplierPaid: () => 'Paid at the time of purchase + later payments to this supplier since go-live.',

  // ── Expenses ──
  byCategory: () => 'Expenses in the selected period, added up by category.',
  expensesTotal: () => 'Every expense in the selected period, added up.',
  tiedToPen: () => 'Expenses recorded against a particular pen. They count fully towards that pen’s costs.',
  generalOverhead: () => 'Expenses not tied to a pen (total − tied to a pen). Reports share these between pens by bird-days.',
  receiptsAttached: () => 'Expenses in the period that have a receipt photo, out of all expenses in the period.',
  expensesVs: (vs: string) => `This period’s total compared with ${vs}: (this − that) ÷ that.`,
  splitByBirds: () => 'A general expense is split between pens by their share of the live birds on the farm now: amount × pen’s birds ÷ all birds.',
  wholeToPen: () => 'This expense was recorded against one pen, so all of it counts towards that pen.',

  // ── Deliveries ──
  deliveriesWeek: () => `Feed and medication purchases received into the store. ${week}`,
  dueNow: () => 'Feed and medication purchases recorded but not yet received into the store.',
  sentBack: () => 'Quantities the store keeper sent back on deliveries received this month (from the 1st to today).',
  feedReceived: () => `Bags of feed received into the store (delivered − sent back). ${month}`,
  inStoreNow: () => explain.stockOnHand(),
  afterReceiving: () => 'In store now + (delivered − sent back) × the units in each pack.',

  // ── Balances in forms ──
  balanceNow: () => 'The current balance with this customer or supplier, from every sale, purchase and payment so far.',
  newBalanceSale: () => 'Balance now + this sale’s total − what’s paid now.',
  newBalancePurchase: () => 'Balance owed now + this purchase’s total − what’s paid now.',
  newBalancePayment: () => 'Balance now − this payment. It clears the oldest unpaid bills first; anything left over is held as credit.',
  balanceAfterSale: () => 'The customer’s balance with this sale included, and what it is now after any later payments.',
}
