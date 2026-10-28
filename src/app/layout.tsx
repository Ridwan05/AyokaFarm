import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata, Viewport } from 'next'
import { Instrument_Serif } from 'next/font/google'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import './globals.css'
import { Providers } from './providers'

const instrumentSerif = Instrument_Serif({ weight: '400', subsets: ['latin', 'latin-ext'], variable: '--font-instrument-serif' })

export const metadata: Metadata = {
  title: 'AyokaFarm',
  description: 'Poultry farm records: production, stock, sales and accounts.',
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f7f7f4',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG" className={cn(GeistSans.variable, GeistMono.variable, instrumentSerif.variable)}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
