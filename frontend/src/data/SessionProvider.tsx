'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '../components/ui/Button'
import { createClient } from '../lib/supabase/client'
import { initialsOf, roleFromDb, type Permissions, type User } from './session'
import { SessionContext } from './sessionContext'

type State = { status: 'loading' } | { status: 'no-role'; name: string } | { status: 'error'; message: string } | { status: 'ready'; user: User }

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<State>({ status: 'loading' })

  const signOut = useCallback(async () => {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }, [router])

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        router.replace('/login')
        return
      }
      const [{ data: profile, error }, { data: pens }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role_id, is_active, roles(name)').eq('id', auth.user.id).single(),
        supabase.from('staff_pens').select('pen_id').eq('profile_id', auth.user.id),
      ])
      if (cancelled) return
      if (error || !profile) return setState({ status: 'error', message: 'Your staff profile couldn’t be loaded.' })
      if (!profile.role_id || !profile.is_active) return setState({ status: 'no-role', name: profile.full_name })
      // What the role can do, from Settings → Roles & permissions. Menus follow it; RLS enforces it.
      const { data: perms, error: permsError } = await supabase.from('role_permissions').select('*').eq('role_id', profile.role_id)
      if (cancelled) return
      if (permsError) return setState({ status: 'error', message: 'Your role’s permissions couldn’t be loaded.' })
      const permissions: Permissions = Object.fromEntries((perms ?? []).map((p) => [p.module, { view: p.can_view, add: p.can_add, edit: p.can_edit, delete: p.can_delete }]))
      setState({
        status: 'ready',
        user: {
          id: profile.id,
          name: profile.full_name,
          initials: initialsOf(profile.full_name),
          role: roleFromDb(profile.role_id),
          roleLabel: profile.roles?.name ?? profile.role_id,
          // "All" production access works on every pen; "own" means the pens in staff_pens.
          pens: permissions.production?.view === 'all' ? 'all' : (pens ?? []).map((p) => p.pen_id),
          permissions,
        },
      })
    })()
    // Signed out in another tab, or the session expired.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [router])

  if (state.status === 'loading') return <Splash>Loading AyokaFarm…</Splash>
  if (state.status !== 'ready') {
    return (
      <Splash>
        <span className="type-h3 text-fg-primary">{state.status === 'no-role' ? `Welcome, ${state.name.split(' ')[0]}` : 'Something went wrong'}</span>
        <span className="max-w-[360px] text-center type-body-md text-fg-secondary">
          {state.status === 'no-role' ? 'Your account is set up, but the owner hasn’t given you a role yet. Ask them to finish adding you in Settings → Staff.' : state.message}
        </span>
        <Button leadingIcon={LogOut} onClick={signOut}>
          Sign out
        </Button>
      </Splash>
    )
  }
  return <SessionContext.Provider value={{ user: state.user, signOut }}>{children}</SessionContext.Provider>
}

export function Splash({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-4 type-body-md text-fg-tertiary">{children}</div>
}
