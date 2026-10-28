'use client'

import { useCurrentUser } from '../data/sessionContext'
import { isAttendant } from '../lib/access'
import AccountsHome from './AccountsHome'
import Dashboard from './Dashboard'
import PenAttendantHome from './PenAttendantHome'
import StockHome from './StockHome'

/** Each role starts on its own home. */
export default function Home() {
  const { role } = useCurrentUser()
  if (role === 'sales-accounts') return <AccountsHome />
  if (role === 'store-keeper') return <StockHome />
  if (isAttendant(role)) return <PenAttendantHome />
  return <Dashboard />
}
