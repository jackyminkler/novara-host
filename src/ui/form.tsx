import type { ReactNode, TextareaHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import { cx } from './primitives'

// One input treatment across the app: hairline border, violet focus halo.

const base =
  'hairline w-full rounded-lg border-[#dad5ec] bg-surface px-[11px] py-2 text-[13px] text-ink outline-none transition placeholder:text-mut focus:ring-focus'

export function Label({
  children,
  htmlFor,
  className,
  aside,
}: {
  children: ReactNode
  htmlFor?: string
  className?: string
  aside?: ReactNode
}) {
  return (
    <div className={cx('mb-[5px] flex items-center justify-between gap-2', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-sec">
        {children}
      </label>
      {aside}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(base, className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(base, 'resize-y', className)} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(base, 'appearance-none pr-8', className)}>
      {children}
    </select>
  )
}

/** Label above a control, the layout used by every form in the wireframes. */
export function Field({
  label,
  htmlFor,
  hint,
  aside,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('mb-[10px]', className)}>
      <Label htmlFor={htmlFor} aside={aside}>
        {label}
      </Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-mut">{hint}</p>}
    </div>
  )
}

/** Editable text that reads as plain copy until it is focused. */
export function InlineText({
  value,
  onCommit,
  placeholder,
  multiline,
  className,
  ariaLabel,
}: {
  value: string
  onCommit: (next: string) => void
  placeholder?: string
  multiline?: boolean
  className?: string
  ariaLabel: string
}) {
  const shared = {
    defaultValue: value,
    placeholder,
    'aria-label': ariaLabel,
    onBlur: (e: { target: { value: string } }) => {
      const next = e.target.value.trim()
      if (next !== value) onCommit(next)
    },
    className: cx(
      'w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[12.5px] text-ink outline-none transition hover:border-line focus:ring-focus focus:bg-surface',
      className,
    ),
  }
  return multiline ? <textarea {...shared} rows={2} /> : <input {...shared} />
}
