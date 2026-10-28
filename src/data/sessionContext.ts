import { createContext, useContext } from 'react'
import { users, type User } from './session'

export type Session = { user: User; setUser: (u: User) => void }

export const SessionContext = createContext<Session>({ user: users[0], setUser: () => {} })

export const useSession = () => useContext(SessionContext)
/** The signed-in person (mock — switchable from the sidebar for the prototype). */
export const useCurrentUser = () => useContext(SessionContext).user
