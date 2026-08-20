import { useAuth } from './AuthProvider'
import { OutlineButton, Sub } from '../ui/primitives'
import { Wordmark } from './Wordmark'

/** Focus column on the plain field. The wordmark is the only branding. */
export default function SignInPage() {
  const { signIn, signInError } = useAuth()

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <div className="mb-[10px] flex justify-center">
          <Wordmark size="lg" />
        </div>
        <Sub className="mb-[18px]">Plan the whole event, not just the invite.</Sub>
        <OutlineButton onClick={signIn} className="px-[18px] py-[9px]">
          Continue with Google
        </OutlineButton>
        {signInError && (
          <p className="mx-auto mt-4 max-w-xs text-[12px] text-sec">
            Sign in didn't work ({signInError}). If that says operation not allowed, Google sign in
            needs to be switched on in the Firebase console first.
          </p>
        )}
      </div>
    </main>
  )
}
