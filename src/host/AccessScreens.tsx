/**
 * What shows before the app does.
 *
 * There used to be two more screens here, for an account that was refused and
 * for an allowlist read that failed. Open signup removed the reason for both:
 * signing in is the whole check, and owner scoping in the rules is what keeps
 * one host's data away from another.
 */
export function Splash() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="accent-gradient h-1.5 w-32 animate-pulse rounded-full" />
    </main>
  )
}
