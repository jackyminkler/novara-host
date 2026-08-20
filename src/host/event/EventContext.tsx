import { createContext, useContext } from 'react'
import type { EventBundle } from '../../data/types'
import type { HostApi } from '../../data/api'

export interface EventContextValue {
  bundle: EventBundle
  reload: () => void
  /** Fire a write then refetch. Every tab edits through this. */
  run: (work: (api: HostApi) => Promise<unknown>) => void
  busy: boolean
  hostName: string
}

const EventContext = createContext<EventContextValue | null>(null)

export const EventProvider = EventContext.Provider

export function useEvent(): EventContextValue {
  const value = useContext(EventContext)
  if (!value) throw new Error('useEvent outside the event workspace')
  return value
}

/** The owner lookup every picker and chip needs, built from the bundle. */
export function useOwnerLookup() {
  const { bundle, hostName } = useEvent()
  return { parties: bundle.parties, orgs: bundle.orgs, crew: bundle.crew, hostName }
}
