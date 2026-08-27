import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

// Emulator mode (VITE_USE_EMULATORS=true) is fully offline: demo project,
// fake config, local auth and firestore. See README for the two commands.
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

// Mock mode never talks to Firebase, but this module still loads on the host
// routes, so it takes the same offline demo config the emulators use. Without
// it, missing env values make getAuth throw at import time on every mock boot.
const offline = useEmulators || import.meta.env.VITE_DATA_MODE === 'mock'

// Real config values come from .env.local (see .env.example). They identify
// the shared Novara Firebase project; access control lives in security rules
// and hp_config/allowlist, not in keeping these values hidden.
const firebaseConfig = offline
  ? {
      apiKey: 'demo-key',
      authDomain: 'localhost',
      projectId: 'demo-novara-host',
      appId: 'demo-app',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
export const db = getFirestore(app)

if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
}
