import { useCallback } from 'react'
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Page } from '../pages/Page'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import { Chip, ErrorState, Loading, Sub, cx } from '../../ui/primitives'
import { InlineText } from '../../ui/form'
import type { ChipTone } from '../../ui/primitives'
import type { EventStatus } from '../../data/types'
import { EventProvider } from './EventContext'
import OverviewTab from './OverviewTab'
import DatesTab from './DatesTab'
import PartiesTab from './PartiesTab'
import TasksTab from './TasksTab'
import RunOfShowTab from './RunOfShowTab'

// Tabbed workspace template. One bundle load feeds every tab, and every write
// refetches it, which is the whole data strategy per guardrail 3.

const STATUS: Record<EventStatus, { label: string; tone: ChipTone }> = {
  draft: { label: 'Draft', tone: 'gray' },
  planning: { label: 'Planning', tone: 'vio' },
  confirmed: { label: 'Confirmed', tone: 'vio' },
  live: { label: 'Live', tone: 'amb' },
  wrapped: { label: 'Wrapped', tone: 'grn' },
}

const TABS = [
  { path: '', label: 'Overview', end: true },
  { path: 'dates', label: 'Dates' },
  { path: 'parties', label: 'Parties' },
  { path: 'tasks', label: 'Tasks' },
  { path: 'run-of-show', label: 'Run of show' },
]

export default function EventWorkspace() {
  const { eventId = '' } = useParams()
  const host = useHost()

  const { data, error, loading, reload } = useAsync(
    (api) => api.getEventBundle(eventId),
    [eventId],
  )
  const { mutate, busy } = useMutation(reload)

  const run = useCallback(
    (work: Parameters<typeof mutate>[0]) => {
      void mutate(work)
    },
    [mutate],
  )

  if (loading && !data) return <Page><Loading label="Loading the event" /></Page>
  if (error) {
    return (
      <Page>
        <ErrorState message={`This event didn't load (${error}).`} onRetry={reload} />
      </Page>
    )
  }
  if (!data) {
    return (
      <Page>
        <ErrorState message="This event is no longer here." />
      </Page>
    )
  }

  const status = STATUS[data.event.status]
  const base = `/app/events/${eventId}`

  // An empty title is refused rather than saved. The title is not only this
  // heading: it names the event in the list, on the calendar chips, and on
  // every guest page built from a token, so blanking it here would leave
  // partners looking at an unnamed event. InlineText keeps its own
  // defaultValue, so the box still shows what was typed until the next load
  // refreshes it; nothing is written, which is the part that matters.
  const commitTitle = (next: string) => {
    if (!next) return
    run((api) => api.updateEvent(eventId, { title: next }))
  }

  return (
    <EventProvider value={{ bundle: data, reload, run, busy, hostName: host.shortName }}>
      <Page>
        <div className="mb-[6px] flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* The title is the one field on an event that had no edit state
                anywhere, so a name typed at creation was permanent. It reads as
                a heading and edits in place, which is the rule in PRD 4.7:
                everything the host sees, the host can edit. */}
            <InlineText
              value={data.event.title}
              ariaLabel="Event title"
              textClass="text-[19px]"
              className="-mx-2 font-display font-semibold"
              onCommit={commitTitle}
            />
            {data.event.location.name && <Sub className="px-2">{data.event.location.name}</Sub>}
          </div>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>

        <div className="mb-3 flex gap-[2px] overflow-x-auto border-b border-line text-[12.5px]">
          {TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path ? `${base}/${tab.path}` : base}
              end={tab.end}
              className={({ isActive }) =>
                cx(
                  'whitespace-nowrap px-[10px] py-[7px] transition',
                  isActive
                    ? 'border-b-2 border-vio font-medium text-vio'
                    : 'border-b-2 border-transparent text-sec hover:text-ink',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>

        <Routes>
          <Route index element={<OverviewTab />} />
          <Route path="dates" element={<DatesTab />} />
          <Route path="parties" element={<PartiesTab />} />
          <Route path="tasks" element={<TasksTab />} />
          <Route path="run-of-show" element={<RunOfShowTab />} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Routes>
      </Page>
    </EventProvider>
  )
}
