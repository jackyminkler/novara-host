// Google Identity Services, shared by the host app and the guest pages.
//
// The two callers ask for very different things. The host requests sensitive
// scopes (calendar.readonly, calendar.events) and pays the price: an
// unverified app screen, and a slot out of the project's 100 lifetime
// unapproved-sensitive grants. A guest requests calendar.freebusy, which is
// non-sensitive, so there is no warning screen, no verification, and no cap.
// That is what makes "everyone drop your calendar into this link" work at any
// size while the host flow stays gated.
//
// Nothing here stores a token. They live in memory for about an hour.

const GIS_SRC = 'https://accounts.google.com/gsi/client'

export const SCOPE_READ = 'https://www.googleapis.com/auth/calendar.readonly'
export const SCOPE_EVENTS = 'https://www.googleapis.com/auth/calendar.events'
/** Busy blocks with no titles or locations, and non-sensitive to Google. */
export const SCOPE_FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy'

export type TokenFailure =
  | 'not_configured'
  | 'consent_required'
  | 'denied'
  | 'popup_blocked'
  | 'network'

export class GoogleAuthError extends Error {
  constructor(public reason: TokenFailure, message?: string) {
    super(message ?? reason)
  }
}

interface TokenResponse {
  access_token?: string
  error?: string
  expires_in?: number
}

interface TokenError {
  type?: string
  message?: string
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: TokenError) => void
          }) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

export const googleClientId: string = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? ''
export const googleConfigured = googleClientId !== ''

let scriptPromise: Promise<void> | null = null

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = GIS_SRC
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      scriptPromise = null
      reject(new GoogleAuthError('network', 'Google sign in script did not load'))
    }
    document.head.appendChild(el)
  })
  return scriptPromise
}

export interface TokenRequest {
  scope: string
  /** False asks silently: no prompt, and an ordinary failure if consent is needed. */
  interactive: boolean
}

/**
 * Ask Google for an access token.
 *
 * Google calls exactly one of callback or error_callback, and in some failure
 * modes neither: a popup blocked before it opens used to leave the caller
 * hanging forever. First outcome wins, and the timeout guarantees one.
 */
export function requestToken({ scope, interactive }: TokenRequest): Promise<string> {
  if (!googleConfigured) return Promise.reject(new GoogleAuthError('not_configured'))

  return loadGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const oauth2 = window.google?.accounts?.oauth2
        if (!oauth2) {
          reject(new GoogleAuthError('network', 'Google sign in did not initialize'))
          return
        }

        let settled = false
        const settle = (fn: () => void) => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          fn()
        }

        const timer = window.setTimeout(
          () =>
            settle(() =>
              reject(
                new GoogleAuthError(
                  interactive ? 'denied' : 'consent_required',
                  'no answer from Google',
                ),
              ),
            ),
          interactive ? 120_000 : 15_000,
        )

        const client = oauth2.initTokenClient({
          client_id: googleClientId,
          scope,
          callback: (response) => {
            if (response.error || !response.access_token) {
              settle(() =>
                reject(
                  new GoogleAuthError(
                    interactive ? 'denied' : 'consent_required',
                    response.error ?? 'no token',
                  ),
                ),
              )
              return
            }
            settle(() => resolve(response.access_token as string))
          },
          error_callback: (error) => {
            // A blocked popup is a browser setting, not a refusal, and saying
            // "Google did not grant access" sends people to the wrong place.
            const blocked = error?.type === 'popup_failed_to_open'
            settle(() =>
              reject(
                new GoogleAuthError(
                  blocked ? 'popup_blocked' : interactive ? 'denied' : 'consent_required',
                  error?.type ?? 'unknown',
                ),
              ),
            )
          },
        })
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
      }),
  )
}

export function revokeToken(token: string): void {
  window.google?.accounts?.oauth2?.revoke(token)
}
