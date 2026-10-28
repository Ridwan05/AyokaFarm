import type { ReactNode } from 'react'
import { AppLayout } from '../../components/layout/AppLayout'
import { SessionProvider } from '../../data/SessionProvider'
import { TradeProvider } from '../../data/store'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TradeProvider>
        <AppLayout>{children}</AppLayout>
      </TradeProvider>
    </SessionProvider>
  )
}
