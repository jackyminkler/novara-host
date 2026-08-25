import { AuthProvider, useAuth } from './AuthProvider'
import SignInPage from './SignInPage'
import HostShell from './HostShell'
import { Splash } from './AccessScreens'

function HostGate() {
  const { access } = useAuth()

  // Signed in is the whole check. Owner scoping in the rules is what keeps
  // one host's data away from another, not a gate at the door.
  if (access === 'loading') return <Splash />
  if (access === 'signedOut') return <SignInPage />
  return <HostShell />
}

export default function HostApp() {
  return (
    <AuthProvider>
      <HostGate />
    </AuthProvider>
  )
}
