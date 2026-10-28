'use client'

import { LogIn } from 'lucide-react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, TextInput } from '../../components/ui/Form'
import { createClient } from '../../lib/supabase/client'
import { loginEmailFor, normalisePhone } from '../../lib/phone'

function LoginForm() {
  const router = useRouter()
  const next = useSearchParams().get('next')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const normalised = normalisePhone(phone)
    if (!normalised) return setError('Enter your phone number, e.g. 0811 386 0000')
    if (!password) return setError('Enter your password')
    setBusy(true)
    setError(null)
    const { error } = await createClient().auth.signInWithPassword({ email: loginEmailFor(normalised), password })
    if (error) {
      setBusy(false)
      // Don't say which part was wrong.
      return setError(error.status === 400 ? 'That phone number and password don’t match' : 'Couldn’t sign in — check your connection and try again')
    }
    // Only follow same-site paths.
    router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-[400px] flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-2">
        <Image src="/logo-mark.svg" width={18} height={23} alt="" />
        <span className="type-h3 text-fg-primary">AyokaFarm</span>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="type-display-md text-fg-primary">Sign in</h1>
        <p className="type-body-md text-fg-secondary">Use the phone number the owner registered for you.</p>
      </div>
      <Field label="Phone number">
        {(id) => <TextInput id={id} type="tel" inputMode="tel" autoComplete="username" placeholder="0811 234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} />}
      </Field>
      <Field label="Password">
        {(id) => <TextInput id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      {error && (
        <p role="alert" className="type-body-sm text-fg-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" leadingIcon={LogIn} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="type-body-sm text-fg-tertiary">Forgot your password? Ask the owner or farm manager to reset it.</p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
