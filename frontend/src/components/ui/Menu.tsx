import { Ellipsis } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

export type MenuItem = {
  label: string
  onSelect: () => void
  /** Destructive items are separated and shown in red. */
  danger?: boolean
  disabled?: boolean
}

const MENU_WIDTH = 232
const ITEM_HEIGHT = 40

/** "…" row menu with a popover list. */
export function RowMenu({ items, label = 'Row actions' }: { items: MenuItem[]; label?: string }) {
  const [place, setPlace] = useState<{ style: CSSProperties; above: boolean } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const open = place !== null

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !menu.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node) && setPlace(null)
    const dismiss = () => setPlace(null)
    document.addEventListener('pointerdown', close)
    // The menu is fixed to the viewport, so it closes rather than drifting away from a scrolled row.
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  function toggle() {
    if (open) return setPlace(null)
    const r = trigger.current!.getBoundingClientRect()
    const height = items.length * ITEM_HEIGHT + 24
    const above = r.bottom + height + 8 > window.innerHeight && r.top > height
    const right = Math.max(8, window.innerWidth - r.right)
    setPlace({ above, style: above ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right } })
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setPlace(null)
      trigger.current?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const list = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const i = list.indexOf(document.activeElement as HTMLElement)
    list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus({ preventScroll: true })
  }

  const regular = items.filter((i) => !i.danger)
  const danger = items.filter((i) => i.danger)

  const renderItem = (item: MenuItem) => (
    <button
      key={item.label}
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={(e) => {
        e.stopPropagation()
        setPlace(null)
        item.onSelect()
      }}
      className={cn(
        'flex h-10 w-full cursor-pointer items-center rounded-sm px-3 text-left type-body-md outline-none hover:bg-subtle focus-visible:bg-subtle focus-visible:shadow-none disabled:cursor-not-allowed disabled:text-fg-disabled',
        item.danger ? 'text-fg-danger' : 'text-fg-primary',
      )}
    >
      {item.label}
    </button>
  )

  return (
    <div className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-icon-secondary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94]"
      >
        <Ellipsis size={16} strokeWidth={1.5} />
      </button>
      {place &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{ ...place.style, width: MENU_WIDTH }}
            // Grows out of the corner nearest the "…" button.
            className={cn('ayk-pop fixed z-[60] rounded-lg bg-surface p-1.5 shadow-lg', place.above ? 'origin-bottom-right' : 'origin-top-right')}
          >
            {regular.map(renderItem)}
            {danger.length > 0 && <div className="my-1 border-t border-line" />}
            {danger.map(renderItem)}
          </div>,
          document.body,
        )}
    </div>
  )
}
