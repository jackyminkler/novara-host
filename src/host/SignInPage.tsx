import { useAuth } from './AuthProvider'
import { OutlineButton, Sub } from '../ui/primitives'
import { Wordmark } from './Wordmark'

/**
 * Focus column on the plain field. The wordmark is the only branding.
 *
 * On the error copy. This screen is shown to hosts signing in, not to us, so it
 * deliberately does NOT name a console fix: a host cannot open the Firebase
 * console, and telling her to is noise at best. The raw code stays on screen
 * because it is the one thing worth reading back to us.
 *
 * The previous copy guessed a single cause — "Google sign in needs to be
 * switched on" — and on 2026-08-29 it was wrong in the field. Google sign in
 * had been enabled the whole time; the code was auth/unauthorized-domain, and
 * the copy sent Jacky to Sign-in method when the fix lived two tabs away. A
 * confident wrong pointer costs more than no pointer. For us, the mapping is:
 *
 *   auth/unauthorized-domain   this hostname is missing from
 *                              Firebase Auth -> Settings -> Authorized domains.
 *                              Every custom domain needs adding by hand.
 *   auth/operation-not-allowed the Google provider is off in
 *                              Firebase Auth -> Sign-in method. The only case
 *                              the old copy described.
 *   Error 400:                 a Google error PAGE, not an SDK code, so it never
 *   redirect_uri_mismatch      reaches signInError and this branch never renders.
 *                              This site's origin and its /__/auth/handler are
 *                              missing from the Google Cloud OAuth web client.
 *                              Bites us and not the consumer app because we set
 *                              authDomain to our own origin (see firebase.ts) to
 *                              survive iOS in-app browser storage partitioning.
 */
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
            Sign in didn't work ({signInError}). Please try again. If it keeps failing, that is a
            setup problem on our end rather than anything you can fix — send us that code in
            brackets and we will sort it.
          </p>
        )}
      </div>
    </main>
  )
}
