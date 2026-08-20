import { AuthProvider, useAuth } from './AuthProvider'
import SignInPage from './SignInPage'
import HostShell from './HostShell'
import { AccessDeniedScreen, AccessErrorScreen, Splash } from './AccessScreens'

function HostGate() {
  const { access } = useAuth()

  if (access === 'loading' || access === 'checking') return <Splash />
  if (access === 'signedOut') return <SignInPage />
  if (access === 'denied') return <AccessDeniedScreen />
  if (access === 'error') return <AccessErrorScreen />
  return <HostShell />
}

export default function HostApp() {
  return (
    <AuthProvider>
      <HostGate />
    </AuthProvider>
  )
}
