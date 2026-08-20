import { cx } from '../ui/primitives'

/** Novara plus the hosts tag. The product's only piece of branding. */
export function Wordmark({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-[7px]', className)}>
      <span className={cx('font-display font-semibold', size === 'lg' ? 'text-[22px]' : 'text-base')}>
        Novara
      </span>
      <span className="rounded-full bg-viot px-[7px] py-[2px] text-[11px] font-medium text-vio">
        hosts
      </span>
    </span>
  )
}
