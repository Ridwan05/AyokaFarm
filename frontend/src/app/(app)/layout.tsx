import type { ReactNode } from 'react'
import { AppLayout } from '../../components/layout/AppLayout'
import { SessionProvider } from '../../data/SessionProvider'
import { TradeProvider } from '../../data/store'

/**
 * Shell for every signed-in screen: loads the session and farm records, then draws the
 * sidebar layout around the page.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TradeProvider>
        <AppLayout>{children}</AppLayout>
      </TradeProvider>
    </SessionProvider>
  )
}
