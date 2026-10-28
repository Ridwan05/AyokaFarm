'use client'

import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { Toaster as Sonner } from 'sonner'
import { useMediaQuery } from '../../lib/useMediaQuery'

const icon = (Icon: typeof CircleCheck) => <Icon size={18} strokeWidth={1.5} />

/** Mount once in the root layout; call `toast()` from anywhere. */
export function Toaster() {
  const wide = useMediaQuery('(min-width: 1024px)')
  return (
    <Sonner
      position={wide ? 'bottom-right' : 'top-center'}
      gap={8}
      icons={{ success: icon(CircleCheck), warning: icon(TriangleAlert), error: icon(CircleAlert), info: icon(Info) }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'flex w-full items-center gap-2.5 rounded-lg bg-inverse px-4 py-3 shadow-lg sm:w-[356px]',
          title: 'type-label-md text-fg-inverse',
          description: 'type-body-sm text-fg-inverse/70',
          icon: 'shrink-0 text-fg-inverse',
          warning: '[&_[data-icon]]:text-[#f2c66d]',
          error: '[&_[data-icon]]:text-[#f29a8a]',
          actionButton: 'ml-auto shrink-0 cursor-pointer rounded-sm bg-surface px-2.5 py-1 type-label-sm text-fg-primary',
        },
      }}
    />
  )
}
