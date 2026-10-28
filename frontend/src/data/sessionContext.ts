import { createContext, useContext } from 'react'
import type { User } from './session'

export type Session = { user: User; signOut: () => Promise<void> }

export const SessionContext = createContext<Session | null>(null)

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/** The signed-in person. */
export const useCurrentUser = () => useSession().user
