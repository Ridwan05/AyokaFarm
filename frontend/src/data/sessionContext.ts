import { createContext, useContext } from 'react'
import type { User } from './session'

/** The signed-in person and how to sign them out. */
export type Session = { user: User; signOut: () => Promise<void> }

/** Provided by SessionProvider once the person's profile and permissions have loaded. */
export const SessionContext = createContext<Session | null>(null)

/** The current session. Only for components inside SessionProvider. */
export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/** The signed-in person. */
export const useCurrentUser = () => useSession().user
