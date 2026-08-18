import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, googleProvider, db, useEmulators } from '../lib/firebase.js'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

// access: loading | signedOut | checking | allowed | denied | error
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [access, setAccess] = useState('loading')
  const [signInError, setSignInError] = useState(null)

  const checkAccess = useCallback(async (u) => {
    setAccess('checking')
    try {
      const snap = await getDoc(doc(db, 'hp_config', 'allowlist'))
      const uids = snap.exists() ? snap.data().uids : []
      setAccess(Array.isArray(uids) && uids.includes(u.uid) ? 'allowed' : 'denied')
    } catch (err) {
      // Rules deny allowlist reads to anyone not on it, so permission-denied
      // is the normal "not a host" signal, not a failure.
      setAccess(err?.code === 'permission-denied' ? 'denied' : 'error')
    }
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
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
      const method = useEmulators ? signInWithRedirect : signInWithPopup
      await method(auth, googleProvider)
    } catch (err) {
      const dismissed =
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      if (!dismissed) {
        setSignInError(err?.code || 'unknown')
      }
    }
  }, [])

  const signOut = useCallback(() => firebaseSignOut(auth), [])

  const retry = useCallback(() => {
    if (user) {
      checkAccess(user)
    }
  }, [user, checkAccess])

  return (
    <AuthContext.Provider
      value={{ user, access, signIn, signOut, retry, signInError }}
    >
      {children}
    </AuthContext.Provider>
  )
}
