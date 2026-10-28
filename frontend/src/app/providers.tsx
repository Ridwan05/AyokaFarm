'use client'

import type { ReactNode } from 'react'
import { Toaster } from '../components/ui/Toast'
import { SessionProvider } from '../data/SessionProvider'
import { TradeProvider } from '../data/store'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TradeProvider>
        {children}
        <Toaster />
      </TradeProvider>
    </SessionProvider>
  )
}
