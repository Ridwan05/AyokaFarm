import { useLayoutEffect, useRef, useState } from 'react'

export type ActiveRect = { left: number; width: number; containerWidth: number }

/**
 * Measures the child marked `data-active="true"` inside the returned ref, so an indicator can
 * slide to it. `ready` turns true one frame after the first measure: the indicator appears in
 * place on mount and only animates on later changes.
 */
export function useActiveRect<T extends HTMLElement>(active: string) {
  const ref = useRef<T>(null)
  const [rect, setRect] = useState<ActiveRect | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const a = el.querySelector<HTMLElement>('[data-active="true"]')
      setRect(a ? { left: a.offsetLeft, width: a.offsetWidth, containerWidth: el.offsetWidth } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active])

  useLayoutEffect(() => {
    if (!rect || ready) return
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [rect, ready])

  return { ref, rect, ready }
}
