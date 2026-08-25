/**
 * One Admin SDK handle for every seed and import script.
 *
 * Two ways to run, and the difference is one environment variable:
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/<script>.mjs
 *       talks to the local emulator, no credentials, no project access.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node seed/<script>.mjs
 *       talks to the real project.
 *
 * The emulator branch skips applicationDefault() on purpose: asking for
 * credentials that are not there fails before the emulator is ever reached,
 * which is what made these scripts unrunnable without a service account key.
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

/** True when the process is pointed at a local emulator rather than a project. */
export const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

/** The project to talk to. The emulator accepts any id; prod needs the real one. */
export const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.FIREBASE_PROJECT ??
  (usingEmulator ? 'demo-novara-host' : undefined)

export function adminDb() {
  if (!getApps().length) {
    initializeApp(usingEmulator ? { projectId } : { credential: applicationDefault(), projectId })
  }
  return getFirestore()
}

/** One line so every script says out loud which database it is about to touch. */
export function announceTarget() {
  console.log(
    usingEmulator
      ? `target: emulator at ${process.env.FIRESTORE_EMULATOR_HOST} (project ${projectId})`
      : `target: LIVE project ${projectId ?? '(from credentials)'}`,
  )
}
