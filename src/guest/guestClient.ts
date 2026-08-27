import type { GuestAction, GuestPayload } from './guestTypes'
import { dataMode } from '../data/api'

// Guests never touch Firestore. Everything goes through the two HTTP
// functions, which validate the capability token with the Admin SDK.
// Hosting rewrites keep these same-origin, so there is no CORS setup.

export class GuestError extends Error {
  constructor(public reason: 'invalid' | 'network') {
    super(reason)
  }
}

async function callFunction(path: string, init?: RequestInit): Promise<GuestPayload> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new GuestError('network')
  }
  if (response.status === 404 || response.status === 403) throw new GuestError('invalid')
  if (!response.ok) throw new GuestError('network')
  return (await response.json()) as GuestPayload
}

export async function fetchGuestView(token: string, you?: string): Promise<GuestPayload> {
  if (dataMode === 'mock') {
    const { mockGuestView } = await import('./mockGuest')
    return mockGuestView(token, you)
  }
  const suffix = you ? `&you=${encodeURIComponent(you)}` : ''
  return callFunction(`/api/guest/view?t=${encodeURIComponent(token)}${suffix}`)
}

export async function submitGuestAction(
  token: string,
  action: GuestAction,
  payload: Record<string, unknown>,
): Promise<GuestPayload> {
  if (dataMode === 'mock') {
    const { mockGuestSubmit } = await import('./mockGuest')
    return mockGuestSubmit(token, action, payload)
  }
  return callFunction('/api/guest/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: token, action, payload }),
  })
}
