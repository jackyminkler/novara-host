import type { ReactNode } from 'react'

// The atoms of design system A.1. Every recurring treatment in the wireframe
// file lives here once, so screens compose instead of restating hexes.

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function Card({
  children,
  className,
  tone = 'plain',
}: {
  children: ReactNode
  className?: string
  tone?: 'plain' | 'violet' | 'amber'
}) {
  const tones = {
    plain: 'bg-surface border-line',
    violet: 'bg-viots border-violine',
    amber: 'bg-ambfill border-ambline',
  }
  return <div className={cx('hairline rounded-[13px] px-[18px] py-4', tones[tone], className)}>{children}</div>
}

export type ChipTone = 'vio' | 'grn' | 'rose' | 'amb' | 'gray' | 'proposed' | 'warn'

const chipTones: Record<ChipTone, string> = {
  vio: 'bg-viot text-vio',
  grn: 'bg-grn text-grnk',
  rose: 'bg-rose text-rosek',
  amb: 'bg-amb text-ambk',
  gray: 'bg-hair text-sec',
  proposed: 'bg-viots text-vio border border-dashed border-viodash',
  warn: 'bg-ambfill text-ambk border border-dashed border-[#e0b564]',
}

export function Chip({
  tone = 'gray',
  children,
  className,
}: {
  tone?: ChipTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-medium',
        chipTones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Small uppercase section label. Never a heading, always a signpost. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('text-[11px] uppercase tracking-[1px] text-mut', className)}>{children}</div>
  )
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx('font-display text-[21px] font-semibold', className)}>{children}</h1>
}

export function SubTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('font-display text-base font-semibold', className)}>{children}</h2>
}

export function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('mt-[3px] text-[13px] text-sec', className)}>{children}</p>
}

/** Label and value on one line, the workhorse of every detail card. */
export function KV({
  label,
  children,
  labelWidth = 'min-w-[120px]',
}: {
  label: ReactNode
  children: ReactNode
  labelWidth?: string
}) {
  return (
    <div className="flex gap-2 py-[5px] text-[12.5px]">
      <span className={cx('font-medium text-sec', labelWidth)}>{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx('my-3 border-t border-hair', className)} />
}

type ButtonProps = {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  title?: string
  'aria-label'?: string
}

/** The gradient appears here and nowhere else. */
export function Button({ children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'accent-gradient inline-flex items-center gap-[6px] rounded-[9px] px-[15px] py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Bordered secondary action. */
export function OutlineButton({ children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'hairline inline-flex items-center gap-[6px] rounded-[9px] border-[#dad5ec] bg-surface px-[13px] py-[7px] text-[12.5px] font-medium text-ink transition hover:border-viodash disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Text-only violet action, used inline inside cards and rows. */
export function QuietButton({ children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center gap-[5px] text-[12.5px] font-medium text-vio transition hover:opacity-70 disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Muted text action for the cancel side of a pair. */
export function GhostButton({ children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('text-[13px] text-sec transition hover:text-ink disabled:opacity-50', className)}
    >
      {children}
    </button>
  )
}

const AVATAR_TONES = [
  'bg-av text-vio',
  'bg-[#fbe3f0] text-[#a5327a]',
  'bg-[#ddefe3] text-[#2f6c46]',
  'bg-[#e3ecfa] text-[#2b58a5]',
  'bg-[#f7e7c6] text-[#7a5510]',
  'bg-viot text-vio',
]

/** Deterministic tint per name, so a partner keeps the same colour everywhere. */
export function avatarTone(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}

export function Avatar({
  name,
  initials,
  size = 28,
  className,
}: {
  name: string
  initials: string
  size?: number
  className?: string
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium',
        avatarTone(name),
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <Card className="py-10 text-center">
      <SubTitle className="mb-1">{title}</SubTitle>
      <p className="mx-auto max-w-sm text-[13px] text-sec">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  )
}

export function Loading({ label }: { label: string }) {
  return <p className="animate-pulse py-8 text-[13px] text-mut">{label}</p>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="text-center">
      <p className="mb-3 text-[13px] text-sec">{message}</p>
      {onRetry && <OutlineButton onClick={onRetry}>Try again</OutlineButton>}
    </Card>
  )
}
