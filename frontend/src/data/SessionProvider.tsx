'use client'

import { useState, type ReactNode } from 'react'
import { users } from './session'
import { SessionContext } from './sessionContext'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(users[0])
  return <SessionContext.Provider value={{ user, setUser }}>{children}</SessionContext.Provider>
}
