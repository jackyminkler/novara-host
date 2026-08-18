import { LogIn } from 'lucide-react'
import { useAuth } from './AuthProvider.jsx'

export default function SignInPage() {
  const { signIn, signInError } = useAuth()

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-8 text-center shadow-sm">
        <div className="accent-gradient mb-6 h-1.5 rounded-full" />
        <h1 className="mb-2 text-xl font-semibold">Novara host platform</h1>
        <p className="mb-6 text-ink/70">
          The planning workspace for your events. Sign in to get started.
        </p>
        <button
          onClick={signIn}
          className="accent-gradient inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-white transition hover:opacity-90"
        >
          <LogIn size={18} />
          Continue with Google
        </button>
        {signInError && (
          <p className="mt-4 text-sm text-ink/60">
            Sign in didn't work ({signInError}). If that says operation not
            allowed, Google sign in needs to be switched on in the Firebase
            console first.
          </p>
        )}
      </div>
    </main>
  )
}
