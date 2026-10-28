'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Drawer as Sheet } from 'vaul'
import { cn } from '../../lib/cn'
import { useMediaQuery } from '../../lib/useMediaQuery'

type OverlayProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Usually two large buttons: Cancel + the main action. */
  footer?: ReactNode
}

const PresenceContext = createContext({ present: true, onExited: () => {} })

/**
 * Wrap a conditionally mounted overlay — `<Presence>{adding && <AddModal/>}</Presence>` — so it
 * can animate out. Each opening still mounts fresh, so forms start empty.
 */
export function Presence({ children }: { children: ReactNode }) {
  const [last, setLast] = useState<ReactNode>(null)
  if (children && children !== last) setLast(children)
  const present = Boolean(children)
  if (!present && !last) return null
  return <PresenceContext.Provider value={{ present, onExited: () => setLast(null) }}>{present ? children : last}</PresenceContext.Provider>
}

/** Focus the first field on open, not the close button. Skipped on touch screens so the keyboard doesn't jump up. */
function focusFirstField(e: Event, wide: boolean) {
  e.preventDefault()
  if (!wide) return
  ;(e.currentTarget as HTMLElement).querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus()
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      data-close
      aria-label="Close"
      onClick={onClose}
      className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md text-icon-primary transition-[background-color,transform] duration-(--dur-press) ease-out hover:bg-subtle motion-safe:active:scale-[0.94]"
    >
      <X size={20} strokeWidth={1.5} />
    </button>
  )
}

function useOverlay(open: boolean) {
  const presence = useContext(PresenceContext)
  const wide = useMediaQuery('(min-width: 1024px)')
  return { open: open && presence.present, onExited: presence.onExited, wide }
}

/** On phones, both overlays become a bottom sheet you can drag down to dismiss. */
function BottomSheet({ open, onClose, onExited, title, subtitle, children, footer }: OverlayProps & { onExited: () => void }) {
  return (
    <Sheet.Root open={open} onOpenChange={(o) => !o && onClose()} onAnimationEnd={(o) => !o && onExited()} repositionInputs={false}>
      <Sheet.Portal>
        <Sheet.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <Sheet.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => focusFirstField(e, false)}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-surface shadow-lg outline-none"
        >
          <Sheet.Handle className="mt-2.5 !h-1 !w-10 !bg-line-strong" />
          <div className="flex items-center gap-3 px-4 pt-3 pb-4">
            <div className="flex min-w-0 flex-1 flex-col">
              <Sheet.Title className="type-h2 text-fg-primary">{title}</Sheet.Title>
              {subtitle && <p className="type-body-sm text-fg-tertiary">{subtitle}</p>}
            </div>
            <CloseButton onClose={onClose} />
          </div>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-5">{children}</div>
          {footer && <div className="flex gap-3 border-t border-line-subtle px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </Sheet.Content>
      </Sheet.Portal>
    </Sheet.Root>
  )
}

function DialogShell({
  open,
  onClose,
  onExited,
  title,
  subtitle,
  children,
  footer,
  variant,
}: OverlayProps & { onExited: () => void; variant: 'modal' | 'panel' }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ayk-scrim fixed inset-0 z-50 bg-scrim" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => focusFirstField(e, true)}
          onAnimationEnd={(e) => e.target === e.currentTarget && !open && onExited()}
          className={cn(
            'fixed z-50 flex flex-col bg-surface shadow-lg outline-none',
            variant === 'modal'
              ? 'ayk-modal top-1/2 left-1/2 max-h-[calc(100dvh-48px)] w-[560px] max-w-[calc(100vw-48px)] -translate-1/2 gap-5 overflow-y-auto rounded-2xl p-6'
              : 'ayk-panel inset-y-0 right-0 w-[480px] max-w-full',
          )}
        >
          <div className={cn('flex items-center gap-3', variant === 'panel' && 'p-6 pb-5')}>
            <div className="flex min-w-0 flex-1 flex-col">
              <Dialog.Title className="type-h2 text-fg-primary">{title}</Dialog.Title>
              {subtitle && <p className="type-body-sm text-fg-tertiary">{subtitle}</p>}
            </div>
            <CloseButton onClose={onClose} />
          </div>
          {variant === 'modal' ? children : <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-5">{children}</div>}
          {footer && <div className={cn('flex gap-3', variant === 'panel' && 'p-6 pt-0')}>{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Centered dialog, 560px wide; a bottom sheet on phones. */
export function Modal(props: OverlayProps) {
  const { open, onExited, wide } = useOverlay(props.open)
  return wide ? <DialogShell {...props} open={open} onExited={onExited} variant="modal" /> : <BottomSheet {...props} open={open} onExited={onExited} />
}

/** Right-hand panel, 480px wide, full height; a bottom sheet on phones. */
export function Drawer(props: OverlayProps) {
  const { open, onExited, wide } = useOverlay(props.open)
  return wide ? <DialogShell {...props} open={open} onExited={onExited} variant="panel" /> : <BottomSheet {...props} open={open} onExited={onExited} />
}
