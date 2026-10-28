'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

type NavLinkProps = {
  href: string
  /** Only match the exact path, not its children. */
  end?: boolean
  className?: string | ((state: { isActive: boolean }) => string)
  children: ReactNode | ((state: { isActive: boolean }) => ReactNode)
  onClick?: () => void
}

/** A link that knows whether it points at the current page. */
export function NavLink({ href, end, className, children, onClick }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = pathname === href || (!end && href !== '/' && pathname.startsWith(href + '/'))
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={typeof className === 'function' ? className({ isActive }) : className}
    >
      {typeof children === 'function' ? children({ isActive }) : children}
    </Link>
  )
}
