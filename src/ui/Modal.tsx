import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { SubTitle } from './primitives'

/** Centred dialog on a dimmed field. Escape and the backdrop both close it. */
export function Modal({
  title,
  onClose,
  children,
  width = 'max-w-[560px]',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#241f3d]/25 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`hairline w-full ${width} rounded-[13px] border-line bg-surface px-[18px] py-4 shadow-[0_12px_34px_rgba(36,31,61,.16)]`}
      >
        <div className="mb-[10px] flex items-center justify-between gap-3">
          <SubTitle>{title}</SubTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-mut transition hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
