import { AuthProvider, useAuth } from './AuthProvider.jsx'
import SignInPage from './SignInPage.jsx'
import HostShell from './HostShell.jsx'
import {
  AccessDeniedScreen,
  AccessErrorScreen,
  Splash,
} from './AccessScreens.jsx'

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
