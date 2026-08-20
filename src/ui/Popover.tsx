import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Small anchored panel for the two-tap pickers: assignee, due date, and the
 * host-recorded date response. Closes on Escape or an outside click.
 *
 * Pass `anchor` when the trigger sits inside a scrolling container. An
 * absolutely positioned panel inside `overflow-x-auto` gets clipped, and
 * worse, it inflates scrollHeight so the container sprouts a vertical
 * scrollbar (overflow-y computes to auto once overflow-x is not visible).
 * The anchored variant renders into document.body and positions itself in
 * viewport coordinates instead, so it can never be clipped.
 */
export function Popover({
  onClose,
  children,
  align = 'left',
  className,
  anchor,
}: {
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
  anchor?: DOMRect | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null)

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

  // A viewport-positioned panel cannot follow its anchor, so close instead of
  // drifting away from it.
  useEffect(() => {
    if (!anchor) return
    const dismiss = () => onClose()
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [anchor, onClose])

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const panel = ref.current.getBoundingClientRect()
    const margin = 8

    let left = anchor.left + anchor.width / 2 - panel.width / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - panel.width - margin))

    // Below the anchor by default, flipped above when there is no room.
    let top = anchor.bottom + 4
    if (top + panel.height > window.innerHeight - margin) {
      const above = anchor.top - panel.height - 4
      top = above >= margin ? above : Math.max(margin, window.innerHeight - panel.height - margin)
    }

    setPlacement({ top, left })
  }, [anchor])

  if (anchor) {
    return createPortal(
      <div
        ref={ref}
        style={{
          top: placement?.top ?? 0,
          left: placement?.left ?? 0,
          // Hidden for the one frame before it has been measured.
          visibility: placement ? 'visible' : 'hidden',
        }}
        className={`hairline fixed z-50 rounded-[11px] border-line bg-surface px-3 py-[10px] shadow-[0_8px_26px_rgba(36,31,61,.14)] ${className ?? ''}`}
      >
        {children}
      </div>,
      document.body,
    )
  }

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
