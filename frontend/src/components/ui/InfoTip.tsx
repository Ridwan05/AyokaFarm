'use client'

import { Info } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

// "How is this calculated?" — an info icon that explains a figure. Hover (after a short delay),
// keyboard focus or a tap opens it; Escape, tapping elsewhere or moving away closes it.

const WIDTH = 264
const GUTTER = 16
const GAP = 6
const HOVER_DELAY = 350
/** Once a tip has been open, neighbours open straight away for a moment (no delay). */
const WARM_MS = 600
let lastClosed = 0

type Place = { left: number; top: number; above: boolean; originX: number }

export function InfoTip({ label, children, size = 14, className }: { label: string; children: ReactNode; size?: number; className?: string }) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [place, setPlace] = useState<Place | null>(null)

  const show = useCallback(() => {
    window.clearTimeout(timer.current)
    const r = button.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.min(WIDTH, window.innerWidth - GUTTER * 2)
    const left = Math.min(Math.max(GUTTER, r.left + r.width / 2 - width / 2), window.innerWidth - GUTTER - width)
    // Above the icon unless it's near the top of the screen.
    const above = r.top > 140
    setPlace({ left, top: above ? r.top - GAP : r.bottom + GAP, above, originX: r.left + r.width / 2 - left })
  }, [])

  const hide = useCallback(() => {
    window.clearTimeout(timer.current)
    setPlace((p) => {
      if (p) lastClosed = Date.now()
      return null
    })
  }, [])

  useEffect(() => {
    if (!place) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide()
    const onDown = (e: PointerEvent) => !button.current?.contains(e.target as Node) && hide()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [place, hide])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`How ${label} is calculated`}
        aria-describedby={place ? id : undefined}
        aria-expanded={Boolean(place)}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return
          if (Date.now() - lastClosed < WARM_MS) show()
          else timer.current = window.setTimeout(show, HOVER_DELAY)
        }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
        onFocus={(e) => e.target.matches(':focus-visible') && show()}
        onBlur={hide}
        onClick={(e) => {
          // Tap to toggle on touch; on desktop a click keeps it open.
          e.stopPropagation()
          e.preventDefault()
          if (place) hide()
          else show()
        }}
        className={cn(
          // 24px hit area without changing the line height around it.
          '-m-1 inline-flex size-6 shrink-0 cursor-help items-center justify-center rounded-full text-icon-secondary transition-colors duration-(--dur-press) hover:text-icon-primary',
          className,
        )}
      >
        <Info size={size} strokeWidth={1.5} aria-hidden />
      </button>
      {place &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{
              left: place.left,
              top: place.top,
              width: Math.min(WIDTH, window.innerWidth - GUTTER * 2),
              transform: place.above ? 'translateY(-100%)' : undefined,
            }}
            className="pointer-events-none fixed z-[70]"
          >
            <div
              style={{ transformOrigin: `${place.originX}px ${place.above ? '100%' : '0%'}` }}
              className="ayk-pop rounded-lg bg-inverse px-3 py-2.5 text-left shadow-lg"
            >
              <p className="type-label-sm text-fg-inverse">{label}</p>
              <p className="mt-0.5 type-body-sm text-fg-inverse/80">{children}</p>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** A label followed by its info icon, e.g. in a tile or card. */
export function InfoLabel({ label, info, className }: { label: ReactNode; info?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {label}
      {info && <InfoTip label={typeof label === 'string' ? label : 'This figure'}>{info}</InfoTip>}
    </span>
  )
}
