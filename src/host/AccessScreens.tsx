import { useState, type ReactNode } from 'react'
import { Check, Copy, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { Card, GhostButton, OutlineButton, SubTitle } from '../ui/primitives'

function Centred({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">{children}</Card>
    </main>
  )
}

export function Splash() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="accent-gradient h-1.5 w-32 animate-pulse rounded-full" />
    </main>
  )
}

export function AccessDeniedScreen() {
  const { user, signOut } = useAuth()
  const [copied, setCopied] = useState(false)

  const copyUid = async () => {
    if (!user) return
    await navigator.clipboard.writeText(user.uid)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Centred>
      <SubTitle className="mb-2">Almost there</SubTitle>
      <p className="mb-6 text-[13px] text-sec">
        {user?.email} isn't on the host list yet. Add this user ID to the allowlist, then sign in
        again.
      </p>
      <div className="mb-6 flex items-center justify-between gap-2 rounded-xl bg-field px-4 py-3">
        <code className="truncate text-[12px]">{user?.uid}</code>
        <button
          onClick={copyUid}
          className="shrink-0 text-sec transition hover:text-ink"
          aria-label="Copy user ID"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <GhostButton onClick={signOut}>Sign out</GhostButton>
    </Centred>
  )
}

export function AccessErrorScreen() {
  const { retry, signOut } = useAuth()

  return (
    <Centred>
      <SubTitle className="mb-2">Something went wrong</SubTitle>
      <p className="mb-6 text-[13px] text-sec">
        Checking access didn't finish. It might be the connection.
      </p>
      <div className="flex items-center justify-center gap-5">
        <OutlineButton onClick={retry}>
          <RefreshCw size={14} />
          Try again
        </OutlineButton>
        <GhostButton onClick={signOut}>
          <LogOut size={14} className="mr-1 inline align-[-2px]" />
          Sign out
        </GhostButton>
      </div>
    </Centred>
  )
}
