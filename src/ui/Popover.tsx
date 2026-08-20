import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Small anchored panel for the two-tap pickers: assignee, due date, and the
 * host-recorded date response. Closes on Escape or an outside click.
 */
export function Popover({
  onClose,
  children,
  align = 'left',
  className,
}: {
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    // Deferred so the click that opened the popover does not close it.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      window.clearTimeout(timer)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={`hairline absolute top-full z-30 mt-1 rounded-[11px] border-line bg-surface px-3 py-[10px] shadow-[0_8px_26px_rgba(36,31,61,.14)] ${
        align === 'right' ? 'right-0' : 'left-0'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

/** One selectable row inside a Popover. */
export function PopoverItem({
  children,
  onClick,
  selected,
  className,
}: {
  children: ReactNode
  onClick: () => void
  selected?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-2 py-[5px] text-left text-[12.5px] transition hover:bg-viots ${
        selected ? 'font-medium text-vio' : 'text-ink'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  )
}
