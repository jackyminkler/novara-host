import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, googleProvider, db, useEmulators } from '../lib/firebase'
import { dataMode } from '../data/api'

export type Access = 'loading' | 'signedOut' | 'checking' | 'allowed' | 'denied' | 'error'

export interface HostIdentity {
  uid: string
  displayName: string
  email: string
  /** First name only, which is how the app addresses the host. */
  shortName: string
}

interface AuthValue {
  user: HostIdentity | null
  access: Access
  signIn: () => void
  signOut: () => void
  retry: () => void
  signInError: string | null
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth outside AuthProvider')
  return value
}

/** Convenience for the many places that only run once access is allowed. */
export function useHost(): HostIdentity {
  const { user } = useAuth()
  if (!user) throw new Error('useHost before sign in')
  return user
}

function toIdentity(u: User): HostIdentity {
  const displayName = u.displayName ?? u.email ?? 'Host'
  return {
    uid: u.uid,
    displayName,
    email: u.email ?? '',
    shortName: displayName.split(' ')[0],
  }
}

/**
 * Mock mode has no Firebase at all, so it hands back a fixture host. This is
 * how the whole host app gets verified against the wireframes with nothing
 * running behind it.
 */
/** Codes that mean "this browser will not give you a popup", not "sign in failed". */
const POPUP_UNAVAILABLE = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

const MOCK_HOST: HostIdentity = {
  uid: 'mock-host-uid',
  displayName: 'Maya Ellison',
  email: 'maya@example.com',
  shortName: 'Maya',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<HostIdentity | null>(dataMode === 'mock' ? MOCK_HOST : null)
  const [access, setAccess] = useState<Access>(dataMode === 'mock' ? 'allowed' : 'loading')
  const [signInError, setSignInError] = useState<string | null>(null)

  const checkAccess = useCallback(async (u: User) => {
    setAccess('checking')
    try {
      const snap = await getDoc(doc(db, 'hp_config', 'allowlist'))
      const uids = snap.exists() ? (snap.data().uids as string[]) : []
      setAccess(Array.isArray(uids) && uids.includes(u.uid) ? 'allowed' : 'denied')
    } catch (err) {
      // Rules deny allowlist reads to anyone not on it, so permission-denied
      // is the normal "not a host" signal, not a failure.
      const code = (err as { code?: string })?.code
      setAccess(code === 'permission-denied' ? 'denied' : 'error')
    }
  }, [])

  useEffect(() => {
    if (dataMode === 'mock') return
    return onAuthStateChanged(auth, (u) => {
      setUser(u ? toIdentity(u) : null)
      if (u) {
        checkAccess(u)
      } else {
        setAccess('signedOut')
      }
    })
  }, [checkAccess])

  const signIn = useCallback(async () => {
    setSignInError(null)
    try {
      // Redirect in emulator mode: the embedded test browser blocks popups.
      if (useEmulators) {
        await signInWithRedirect(auth, googleProvider)
        return
      }
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'unknown'

      // Closing the popup is a decision, not a failure.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return

      // iOS in-app browsers (a link opened from Messages or Instagram) block
      // window.open outright, so fall back to a full redirect. That only
      // survives storage partitioning because authDomain is the same origin
      // as the app; pointing it at <project>.firebaseapp.com fails here with
      // "missing initial state".
      if (POPUP_UNAVAILABLE.has(code)) {
        try {
          await signInWithRedirect(auth, googleProvider)
          return
        } catch (redirectErr) {
          setSignInError((redirectErr as { code?: string })?.code ?? 'unknown')
          return
        }
      }

      setSignInError(code)
    }
  }, [])

  const signOut = useCallback(() => {
    if (dataMode !== 'mock') void firebaseSignOut(auth)
  }, [])

  const retry = useCallback(() => {
    if (dataMode === 'mock') return
    const current = auth.currentUser
    if (current) void checkAccess(current)
  }, [checkAccess])

  return (
    <AuthContext.Provider value={{ user, access, signIn, signOut, retry, signInError }}>
      {children}
    </AuthContext.Provider>
  )
}
