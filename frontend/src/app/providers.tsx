'use client'

import type { ReactNode } from 'react'
import { Toaster } from '../components/ui/Toast'

/** App-wide providers. Signed-in data (session, farm records) lives in the (app) layout. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
