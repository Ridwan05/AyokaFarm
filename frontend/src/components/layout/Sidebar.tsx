'use client'

import Image from 'next/image'
import { ChevronsUpDown, LogOut, Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Drawer as Sheet } from 'vaul'
import { farm } from '../../data/session'
import { useSession } from '../../data/sessionContext'
import { describeArea, settingsHomeFor } from '../../lib/access'
import { cn } from '../../lib/cn'
import { Avatar } from '../ui/Avatar'
import { NavLink } from '../ui/NavLink'
import { canSee, navFor, settingsItem, type NavItem } from './nav'

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      href={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-11 w-full shrink-0 items-center gap-3 rounded-md pr-2 pl-3 transition-[background-color,transform] duration-(--dur-press) ease-out motion-safe:active:scale-[0.98] lg:h-10',
          isActive
            ? 'bg-subtle type-label-md text-fg-primary'
            : 'type-body-md text-fg-secondary hover:bg-canvas hover:text-fg-primary',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={20}
            strokeWidth={1.5}
            className={isActive ? 'text-icon-brand' : 'text-icon-secondary'}
          />
          <span className="flex-1 truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function Logo() {
  return <Image src="/logo-mark.svg" width={18} height={23} alt="" />
}

/** The signed-in person, with sign out. */
function UserCard() {
  const { user, signOut } = useSession()
  return (
    <div className="flex w-full shrink-0 items-center gap-3 border-t border-line-subtle pt-3 pr-2 pl-3">
      <Avatar initials={user.initials} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-label-md text-fg-primary">{user.name}</span>
        <span className="truncate type-body-sm text-fg-tertiary">{user.roleLabel}</span>
      </span>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => void signOut()}
        className="flex size-9 cursor-pointer items-center justify-center rounded-md text-icon-secondary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94]"
      >
        <LogOut size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useSession()
  const role = user.role
  const settings = { ...settingsItem, to: settingsHomeFor(role) }
  return (
    <>
      <button
        type="button"
        aria-label="Switch farm"
        className="flex w-full shrink-0 cursor-pointer items-center gap-2 pr-2 pb-5 pl-3 text-left"
      >
        <Logo />
        <span className="flex-1 type-h3 text-fg-primary">{farm.name}</span>
        <ChevronsUpDown size={16} strokeWidth={1.5} className="text-icon-secondary" />
      </button>

      {/* Only the nav scrolls, so the account and Settings stay in reach on short phone screens. */}
      <nav aria-label="Main" className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-4">
        {navFor(role).map((group, i) => {
          const items = group.items.filter((item) => canSee(item, user))
          if (!items.length) return null
          return (
            <div key={group.label ?? i} className="flex flex-col gap-0.5">
              {group.label && (
                <p className="pt-4 pb-1 pl-3 type-overline text-fg-tertiary">{group.label}</p>
              )}
              {items.map((item) => (
                <NavRow key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          )
        })}
      </nav>

      {canSee(settings, user) && <NavRow item={settings} onNavigate={onNavigate} />}
      <UserCard />
    </>
  )
}

/** Sticky sidebar on wide screens. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-0.5 border-r border-line bg-surface px-3 pt-5 pb-4 lg:flex">
      <SidebarContent />
    </aside>
  )
}

/** Top bar on phones and tablets; the menu button slides the same sidebar in from the left. */
export function TopBar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const area = describeArea(pathname)
  const close = () => setOpen(false)
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-2 backdrop-blur-md lg:hidden">
      <Sheet.Root direction="left" open={open} onOpenChange={setOpen}>
        <Sheet.Trigger
          aria-label="Open menu"
          className="flex size-11 cursor-pointer items-center justify-center rounded-md text-icon-primary transition-transform duration-(--dur-press) ease-out motion-safe:active:scale-[0.94]"
        >
          <Menu size={22} strokeWidth={1.5} />
        </Sheet.Trigger>
        <Sheet.Portal>
          <Sheet.Overlay className="fixed inset-0 z-50 bg-scrim" />
          <Sheet.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col gap-0.5 bg-surface px-3 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg outline-none"
          >
            <Sheet.Title className="sr-only">Menu</Sheet.Title>
            <SidebarContent onNavigate={close} />
          </Sheet.Content>
        </Sheet.Portal>
      </Sheet.Root>
      <Logo />
      <span className="truncate type-h3 text-fg-primary">{pathname === '/' ? farm.name : area.label}</span>
    </header>
  )
}
