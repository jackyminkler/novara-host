import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageTitle, Sub, cx } from '../../ui/primitives'

/** Standard host page padding. Desktop-comfortable, still fine on a phone. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('px-4 py-5 sm:px-6', className)}>{children}</div>
}

/** Focus column: a single narrow stack centred on the field. */
export function FocusColumn({ children, width = 'max-w-[460px]' }: { children: ReactNode; width?: string }) {
  return (
    <div className="flex justify-center px-4 py-5 sm:px-6">
      <div className={cx('w-full', width)}>{children}</div>
    </div>
  )
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="mb-2 inline-flex items-center gap-[5px] text-[12.5px] font-medium text-vio transition hover:opacity-70"
    >
      <ArrowLeft size={14} />
      {children}
    </Link>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <PageTitle className="text-[19px]">{title}</PageTitle>
        {subtitle && <Sub>{subtitle}</Sub>}
      </div>
      {action}
    </div>
  )
}
