import { useState } from 'react'
import { Check, Copy, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from './AuthProvider.jsx'

function Card({ children }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-8 text-center shadow-sm">
        {children}
      </div>
    </main>
  )
}

export function Splash() {
  return (
    <Card>
      <div className="accent-gradient h-1.5 animate-pulse rounded-full" />
    </Card>
  )
}

export function AccessDeniedScreen() {
  const { user, signOut } = useAuth()
  const [copied, setCopied] = useState(false)

  const copyUid = async () => {
    await navigator.clipboard.writeText(user.uid)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <h1 className="mb-2 text-xl font-semibold">Almost there</h1>
      <p className="mb-6 text-ink/70">
        {user.email} isn't on the host list yet. Add this user ID to the
        allowlist, then sign in again.
      </p>
      <div className="mb-6 flex items-center justify-between gap-2 rounded-xl border border-ink/10 bg-canvas px-4 py-3">
        <code className="truncate text-sm">{user.uid}</code>
        <button
          onClick={copyUid}
          className="shrink-0 text-ink/60 transition hover:text-ink"
          aria-label="Copy user ID"
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>
      </div>
      <button
        onClick={signOut}
        className="inline-flex items-center gap-2 text-sm font-medium text-ink/60 transition hover:text-ink"
      >
        <LogOut size={16} />
        Sign out
      </button>
    </Card>
  )
}

export function AccessErrorScreen() {
  const { retry, signOut } = useAuth()

  return (
    <Card>
      <h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
      <p className="mb-6 text-ink/70">
        Checking access didn't finish. It might be the connection.
      </p>
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={retry}
          className="inline-flex items-center gap-2 text-sm font-medium text-ink transition hover:opacity-70"
        >
          <RefreshCw size={16} />
          Try again
        </button>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-2 text-sm font-medium text-ink/60 transition hover:text-ink"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </Card>
  )
}
