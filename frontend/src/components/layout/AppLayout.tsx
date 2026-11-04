'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useCurrentUser } from '../../data/sessionContext'
import { canAccess } from '../../lib/access'
import NoAccess from '../../screens/NoAccess'
import { Sidebar, TopBar } from './Sidebar'

/**
 * Sidebar, top bar and page column around every signed-in screen. A page the user's role
 * can't open shows the no-access screen instead.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const user = useCurrentUser()
  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <TopBar />
        <div className="mx-auto flex max-w-[1192px] flex-col gap-6 px-4 pt-5 pb-12 sm:px-6 lg:px-10 lg:pt-8">
          {/* Hiding the page is only for the user; RLS still guards the data itself. */}
          {canAccess(pathname, user) ? children : <NoAccess />}
        </div>
      </main>
    </div>
  )
}
